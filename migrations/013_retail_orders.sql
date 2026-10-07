CREATE TABLE retail_products (
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 sku TEXT NOT NULL CHECK(length(trim(sku)) BETWEEN 1 AND 60),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(store_id,sku), UNIQUE(id,store_id)
);
CREATE TABLE retail_product_versions (
 product_id TEXT NOT NULL,
 store_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>=1),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 category TEXT NOT NULL CHECK(category IN('frame','lens','accessory','service')),
 brand TEXT CHECK(brand IS NULL OR length(brand)<=80),
 specification TEXT NOT NULL CHECK(length(trim(specification)) BETWEEN 1 AND 1000),
 unit TEXT NOT NULL CHECK(length(trim(unit)) BETWEEN 1 AND 20),
 list_price_cents INTEGER NOT NULL CHECK(typeof(list_price_cents)='integer' AND list_price_cents BETWEEN 0 AND 1000000000),
 status TEXT NOT NULL CHECK(status IN('active','inactive')),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(product_id,version), UNIQUE(product_id,version,store_id),
 FOREIGN KEY(product_id,store_id) REFERENCES retail_products(id,store_id)
);
CREATE TABLE retail_orders (
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 serial INTEGER NOT NULL CHECK(serial>=1),
 order_number TEXT NOT NULL,
 cycle_id TEXT,
 cycle_version INTEGER,
 visit_id TEXT,
 context_basis TEXT NOT NULL CHECK(context_basis IN('customer','cycle','visit','visit_cycle')),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(store_id,serial), UNIQUE(store_id,order_number), UNIQUE(id,customer_id,store_id),
 FOREIGN KEY(customer_id,store_id) REFERENCES customers(id,store_id),
 FOREIGN KEY(cycle_id,cycle_version,customer_id) REFERENCES cycle_versions(cycle_id,version,customer_id),
 FOREIGN KEY(visit_id,customer_id) REFERENCES visits(id,customer_id),
 CHECK((cycle_id IS NULL AND cycle_version IS NULL) OR (cycle_id IS NOT NULL AND cycle_version IS NOT NULL)),
 CHECK((context_basis='customer' AND cycle_id IS NULL AND visit_id IS NULL) OR (context_basis='cycle' AND cycle_id IS NOT NULL AND visit_id IS NULL) OR (context_basis='visit' AND cycle_id IS NULL AND visit_id IS NOT NULL) OR (context_basis='visit_cycle' AND cycle_id IS NOT NULL AND visit_id IS NOT NULL))
);
CREATE INDEX retail_orders_customer ON retail_orders(customer_id,created_at,id);
CREATE TABLE retail_order_versions (
 order_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>=1),
 customer_id TEXT NOT NULL,
 store_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 notes TEXT CHECK(notes IS NULL OR length(notes)<=2000),
 status TEXT NOT NULL CHECK(status IN('draft','cancelled')),
 subtotal_cents INTEGER NOT NULL CHECK(typeof(subtotal_cents)='integer' AND subtotal_cents BETWEEN 0 AND 30000000000000),
 currency TEXT NOT NULL CHECK(currency='CNY'),
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(order_id,version), UNIQUE(order_id,version,customer_id,store_id),
 FOREIGN KEY(order_id,customer_id,store_id) REFERENCES retail_orders(id,customer_id,store_id)
);
CREATE TABLE retail_order_items (
 order_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 30),
 customer_id TEXT NOT NULL,
 store_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 product_version INTEGER NOT NULL,
 quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity BETWEEN 1 AND 999),
 unit_price_cents INTEGER NOT NULL CHECK(typeof(unit_price_cents)='integer' AND unit_price_cents BETWEEN 0 AND 1000000000),
 line_total_cents INTEGER NOT NULL CHECK(line_total_cents=quantity*unit_price_cents),
 note TEXT CHECK(note IS NULL OR length(note)<=300),
 PRIMARY KEY(order_id,version,position),
 FOREIGN KEY(order_id,version,customer_id,store_id) REFERENCES retail_order_versions(order_id,version,customer_id,store_id),
 FOREIGN KEY(product_id,product_version,store_id) REFERENCES retail_product_versions(product_id,version,store_id)
);
CREATE TABLE retail_order_documents (
 order_id TEXT NOT NULL, version INTEGER NOT NULL, customer_id TEXT NOT NULL, store_id TEXT NOT NULL, document_version_id TEXT NOT NULL,
 PRIMARY KEY(order_id,version,document_version_id),
 FOREIGN KEY(order_id,version,customer_id,store_id) REFERENCES retail_order_versions(order_id,version,customer_id,store_id),
 FOREIGN KEY(document_version_id,customer_id) REFERENCES document_versions(id,customer_id)
);
CREATE TABLE retail_order_attachments (
 order_id TEXT NOT NULL, version INTEGER NOT NULL, customer_id TEXT NOT NULL, store_id TEXT NOT NULL, attachment_id TEXT NOT NULL,
 PRIMARY KEY(order_id,version,attachment_id),
 FOREIGN KEY(order_id,version,customer_id,store_id) REFERENCES retail_order_versions(order_id,version,customer_id,store_id),
 FOREIGN KEY(attachment_id,customer_id) REFERENCES attachments(id,customer_id)
);
CREATE TRIGGER retail_product_scope BEFORE INSERT ON retail_products BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=NEW.created_by AND u.store_id=NEW.store_id AND u.role='manager' AND u.active=1 AND COALESCE(s.must_change_password,0)=0) THEN RAISE(ABORT,'product actor not allowed') END;
END;
CREATE TRIGGER retail_product_version_ready BEFORE INSERT ON retail_product_versions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_products p JOIN users u ON u.id=NEW.created_by LEFT JOIN user_security s ON s.user_id=u.id WHERE p.id=NEW.product_id AND p.store_id=NEW.store_id AND u.store_id=p.store_id AND u.role='manager' AND u.active=1 AND COALESCE(s.must_change_password,0)=0 AND NEW.version=COALESCE((SELECT max(version)+1 FROM retail_product_versions WHERE product_id=p.id),1) AND NEW.created_at>=p.created_at AND NEW.created_at>=COALESCE((SELECT max(created_at) FROM retail_product_versions WHERE product_id=p.id),p.created_at)) THEN RAISE(ABORT,'product version not allowed') END;
END;
CREATE TRIGGER retail_order_ready BEFORE INSERT ON retail_orders BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=NEW.created_by AND u.store_id=NEW.store_id AND u.role IN('manager','reception') AND u.active=1 AND COALESCE(s.must_change_password,0)=0) THEN RAISE(ABORT,'order actor not allowed') END;
 SELECT CASE WHEN NEW.cycle_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cycle_versions WHERE cycle_id=NEW.cycle_id AND version=NEW.cycle_version AND customer_id=NEW.customer_id AND type='retail') THEN RAISE(ABORT,'order cycle not retail') END;
 SELECT CASE WHEN NEW.context_basis='cycle' AND NEW.cycle_version<>(SELECT max(version) FROM cycle_versions WHERE cycle_id=NEW.cycle_id) THEN RAISE(ABORT,'order cycle stale') END;
 SELECT CASE WHEN NEW.context_basis='visit_cycle' AND NOT EXISTS(SELECT 1 FROM visit_cycle_versions WHERE visit_id=NEW.visit_id AND cycle_id=NEW.cycle_id AND customer_id=NEW.customer_id AND basis='captured' AND version=NEW.cycle_version) THEN RAISE(ABORT,'order visit version not captured') END;
END;
CREATE TRIGGER retail_order_version_ready BEFORE INSERT ON retail_order_versions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_orders o JOIN users u ON u.id=NEW.created_by LEFT JOIN user_security s ON s.user_id=u.id WHERE o.id=NEW.order_id AND o.customer_id=NEW.customer_id AND o.store_id=NEW.store_id AND u.store_id=o.store_id AND u.role IN('manager','reception') AND u.active=1 AND COALESCE(s.must_change_password,0)=0 AND NEW.version=COALESCE((SELECT max(version)+1 FROM retail_order_versions WHERE order_id=o.id),1) AND COALESCE((SELECT status FROM retail_order_versions WHERE order_id=o.id ORDER BY version DESC LIMIT 1),'draft')='draft' AND (NEW.version>1 OR NEW.status='draft') AND NEW.created_at>=o.created_at AND NEW.created_at>=COALESCE((SELECT max(created_at) FROM retail_order_versions WHERE order_id=o.id),o.created_at)) THEN RAISE(ABORT,'order version not allowed') END;
 SELECT CASE WHEN json_type(NEW.manifest_json,'$.items') IS NOT 'array' OR json_type(NEW.manifest_json,'$.document_version_ids') IS NOT 'array' OR json_type(NEW.manifest_json,'$.attachment_ids') IS NOT 'array' OR json_array_length(NEW.manifest_json,'$.items') NOT BETWEEN 1 AND 30 OR json_array_length(NEW.manifest_json,'$.document_version_ids')>10 OR json_array_length(NEW.manifest_json,'$.attachment_ids')>10 THEN RAISE(ABORT,'order manifest invalid') END;
 SELECT CASE WHEN NEW.subtotal_cents IS NOT (SELECT sum(json_extract(j.value,'$.quantity')*json_extract(j.value,'$.unit_price_cents')) FROM json_each(NEW.manifest_json,'$.items') j) THEN RAISE(ABORT,'order manifest total invalid') END;
 SELECT CASE WHEN NEW.status='cancelled' AND NOT EXISTS(SELECT 1 FROM retail_order_versions v WHERE v.order_id=NEW.order_id AND v.version=NEW.version-1 AND NEW.title=v.title AND NEW.notes IS v.notes AND NEW.manifest_json=v.manifest_json AND NEW.subtotal_cents=v.subtotal_cents) THEN RAISE(ABORT,'cancelled order content changed') END;
END;
CREATE TRIGGER retail_item_manifest BEFORE INSERT ON retail_order_items BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_order_versions v,json_each(v.manifest_json,'$.items') j WHERE v.order_id=NEW.order_id AND v.version=NEW.version AND CAST(j.key AS INTEGER)=NEW.position-1 AND json_extract(j.value,'$.product_id')=NEW.product_id AND json_extract(j.value,'$.product_version')=NEW.product_version AND json_extract(j.value,'$.quantity')=NEW.quantity AND json_extract(j.value,'$.unit_price_cents')=NEW.unit_price_cents AND json_extract(j.value,'$.note') IS NEW.note) THEN RAISE(ABORT,'order item outside manifest') END;
END;
CREATE TRIGGER retail_document_manifest BEFORE INSERT ON retail_order_documents BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_order_versions v,json_each(v.manifest_json,'$.document_version_ids') j WHERE v.order_id=NEW.order_id AND v.version=NEW.version AND j.value=NEW.document_version_id) THEN RAISE(ABORT,'order document outside manifest') END;
END;
CREATE TRIGGER retail_attachment_manifest BEFORE INSERT ON retail_order_attachments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_order_versions v,json_each(v.manifest_json,'$.attachment_ids') j WHERE v.order_id=NEW.order_id AND v.version=NEW.version AND j.value=NEW.attachment_id) THEN RAISE(ABORT,'order attachment outside manifest') END;
END;
CREATE TRIGGER retail_products_no_update BEFORE UPDATE ON retail_products BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_products_no_delete BEFORE DELETE ON retail_products BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_product_versions_no_update BEFORE UPDATE ON retail_product_versions BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_product_versions_no_delete BEFORE DELETE ON retail_product_versions BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_orders_no_update BEFORE UPDATE ON retail_orders BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_orders_no_delete BEFORE DELETE ON retail_orders BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_order_versions_no_update BEFORE UPDATE ON retail_order_versions BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_order_versions_no_delete BEFORE DELETE ON retail_order_versions BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_order_items_no_update BEFORE UPDATE ON retail_order_items BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_order_items_no_delete BEFORE DELETE ON retail_order_items BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_order_documents_no_update BEFORE UPDATE ON retail_order_documents BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_order_documents_no_delete BEFORE DELETE ON retail_order_documents BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_order_attachments_no_update BEFORE UPDATE ON retail_order_attachments BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
CREATE TRIGGER retail_order_attachments_no_delete BEFORE DELETE ON retail_order_attachments BEGIN SELECT RAISE(ABORT,'retail history immutable'); END;
