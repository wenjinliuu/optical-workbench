CREATE TABLE inventory_order_events (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, order_version INTEGER NOT NULL, customer_id TEXT NOT NULL, store_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=1 AND typeof(revision)='integer'), action TEXT NOT NULL CHECK(action IN('reserve','release')), source_id TEXT REFERENCES inventory_order_events(id),
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)), reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300), created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(order_id,revision), UNIQUE(id,order_id,order_version,customer_id,store_id),
 FOREIGN KEY(order_id,order_version,customer_id,store_id) REFERENCES retail_order_versions(order_id,version,customer_id,store_id),
 CHECK((action='reserve' AND source_id IS NULL) OR (action='release' AND source_id IS NOT NULL))
);
CREATE INDEX inventory_order_customer ON inventory_order_events(customer_id,created_at,id);
CREATE TABLE inventory_order_lines (
 event_id TEXT NOT NULL, order_id TEXT NOT NULL, order_version INTEGER NOT NULL, position INTEGER NOT NULL,
 customer_id TEXT NOT NULL, store_id TEXT NOT NULL, product_id TEXT NOT NULL, product_version INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 999 AND typeof(quantity)='integer'),
 stock_event_id TEXT NOT NULL UNIQUE REFERENCES inventory_events(id) DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(event_id,position),
 FOREIGN KEY(event_id,order_id,order_version,customer_id,store_id) REFERENCES inventory_order_events(id,order_id,order_version,customer_id,store_id),
 FOREIGN KEY(order_id,order_version,position) REFERENCES retail_order_items(order_id,version,position),
 FOREIGN KEY(product_id,product_version,store_id) REFERENCES retail_product_versions(product_id,version,store_id)
);
CREATE TABLE inventory_events (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL, product_version INTEGER NOT NULL, store_id TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence>=1 AND typeof(sequence)='integer'), action TEXT NOT NULL CHECK(action IN('receive','isolate','unquarantine','reserve','release')), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000000 AND typeof(quantity)='integer'),
 available INTEGER NOT NULL CHECK(available BETWEEN 0 AND 1000000000 AND typeof(available)='integer'), reserved INTEGER NOT NULL CHECK(reserved BETWEEN 0 AND 1000000000 AND typeof(reserved)='integer'), quarantined INTEGER NOT NULL CHECK(quarantined BETWEEN 0 AND 1000000000 AND typeof(quarantined)='integer'),
 order_event_id TEXT, order_position INTEGER, reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300), created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(product_id,sequence),
 FOREIGN KEY(product_id,product_version,store_id) REFERENCES retail_product_versions(product_id,version,store_id),
 FOREIGN KEY(order_event_id,order_position) REFERENCES inventory_order_lines(event_id,position),
 CHECK((action IN('reserve','release') AND order_event_id IS NOT NULL AND order_position IS NOT NULL) OR (action IN('receive','isolate','unquarantine') AND order_event_id IS NULL AND order_position IS NULL))
);
CREATE INDEX inventory_store ON inventory_events(store_id,product_id,sequence);
CREATE TRIGGER inventory_order_ready BEFORE INSERT ON inventory_order_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=NEW.created_by AND u.store_id=NEW.store_id AND u.role IN('manager','reception') AND u.active=1 AND COALESCE(s.must_change_password,0)=0) THEN RAISE(ABORT,'inventory order actor not allowed') END;
 SELECT CASE WHEN NEW.revision<>COALESCE((SELECT max(revision)+1 FROM inventory_order_events WHERE order_id=NEW.order_id),1) OR NEW.created_at<COALESCE((SELECT max(created_at) FROM inventory_order_events WHERE order_id=NEW.order_id),'') THEN RAISE(ABORT,'inventory order revision invalid') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_order_versions v WHERE v.order_id=NEW.order_id AND v.version=NEW.order_version AND v.version=(SELECT max(version) FROM retail_order_versions WHERE order_id=v.order_id) AND v.status='draft') THEN RAISE(ABORT,'inventory order draft changed') END;
 SELECT CASE WHEN json_type(NEW.manifest_json) IS NOT 'array' OR json_array_length(NEW.manifest_json) NOT BETWEEN 1 AND 30 THEN RAISE(ABORT,'inventory order manifest invalid') END;
 SELECT CASE WHEN NEW.action='reserve' AND (SELECT action FROM inventory_order_events WHERE order_id=NEW.order_id ORDER BY revision DESC LIMIT 1)='reserve' THEN RAISE(ABORT,'inventory order already reserved') END;
 SELECT CASE WHEN NEW.action='release' AND NOT EXISTS(SELECT 1 FROM inventory_order_events e WHERE e.id=NEW.source_id AND e.order_id=NEW.order_id AND e.revision=NEW.revision-1 AND e.action='reserve' AND e.order_version=NEW.order_version) THEN RAISE(ABORT,'inventory release source invalid') END;
END;
CREATE TRIGGER inventory_line_ready BEFORE INSERT ON inventory_order_lines BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_order_items i JOIN retail_product_versions p ON p.product_id=i.product_id AND p.version=i.product_version WHERE i.order_id=NEW.order_id AND i.version=NEW.order_version AND i.position=NEW.position AND i.customer_id=NEW.customer_id AND i.store_id=NEW.store_id AND i.product_id=NEW.product_id AND i.product_version=NEW.product_version AND i.quantity=NEW.quantity AND p.category<>'service') THEN RAISE(ABORT,'inventory line not original order item') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM inventory_order_events e,json_each(e.manifest_json) j WHERE e.id=NEW.event_id AND json_extract(j.value,'$.position')=NEW.position AND json_extract(j.value,'$.product_id')=NEW.product_id AND json_extract(j.value,'$.product_version')=NEW.product_version AND json_extract(j.value,'$.quantity')=NEW.quantity AND json_extract(j.value,'$.stock_event_id')=NEW.stock_event_id) THEN RAISE(ABORT,'inventory line outside manifest') END;
END;
CREATE TRIGGER inventory_event_ready BEFORE INSERT ON inventory_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=NEW.created_by AND u.store_id=NEW.store_id AND u.active=1 AND COALESCE(s.must_change_password,0)=0 AND (u.role='manager' OR u.role='reception' AND NEW.action IN('reserve','release'))) THEN RAISE(ABORT,'inventory actor not allowed') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_product_versions p WHERE p.product_id=NEW.product_id AND p.version=NEW.product_version AND p.store_id=NEW.store_id AND p.category<>'service' AND NEW.created_at>=p.created_at) THEN RAISE(ABORT,'inventory product invalid') END;
 SELECT CASE WHEN NEW.sequence<>COALESCE((SELECT max(sequence)+1 FROM inventory_events WHERE product_id=NEW.product_id),1) OR NEW.created_at<COALESCE((SELECT max(created_at) FROM inventory_events WHERE product_id=NEW.product_id),'') THEN RAISE(ABORT,'inventory sequence invalid') END;
 SELECT CASE WHEN NEW.available<>COALESCE((SELECT available FROM inventory_events WHERE product_id=NEW.product_id ORDER BY sequence DESC LIMIT 1),0)+CASE NEW.action WHEN 'receive' THEN NEW.quantity WHEN 'unquarantine' THEN NEW.quantity WHEN 'release' THEN NEW.quantity ELSE -NEW.quantity END OR NEW.reserved<>COALESCE((SELECT reserved FROM inventory_events WHERE product_id=NEW.product_id ORDER BY sequence DESC LIMIT 1),0)+CASE NEW.action WHEN 'reserve' THEN NEW.quantity WHEN 'release' THEN -NEW.quantity ELSE 0 END OR NEW.quarantined<>COALESCE((SELECT quarantined FROM inventory_events WHERE product_id=NEW.product_id ORDER BY sequence DESC LIMIT 1),0)+CASE NEW.action WHEN 'isolate' THEN NEW.quantity WHEN 'unquarantine' THEN -NEW.quantity ELSE 0 END THEN RAISE(ABORT,'inventory balance invalid') END;
 SELECT CASE WHEN NEW.order_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory_order_lines l JOIN inventory_order_events e ON e.id=l.event_id WHERE l.event_id=NEW.order_event_id AND l.position=NEW.order_position AND l.stock_event_id=NEW.id AND l.product_id=NEW.product_id AND l.product_version=NEW.product_version AND l.quantity=NEW.quantity AND l.store_id=NEW.store_id AND e.action=NEW.action AND e.reason=NEW.reason AND e.created_by=NEW.created_by AND e.created_at=NEW.created_at) THEN RAISE(ABORT,'inventory event not original reservation') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM inventory_events first JOIN retail_product_versions p ON p.product_id=first.product_id AND p.version=first.product_version JOIN retail_product_versions next ON next.product_id=NEW.product_id AND next.version=NEW.product_version WHERE first.product_id=NEW.product_id AND first.sequence=1 AND (p.unit<>next.unit OR p.category<>next.category)) THEN RAISE(ABORT,'inventory unit changed') END;
END;
CREATE TRIGGER inventory_catalog_basis BEFORE INSERT ON retail_product_versions WHEN EXISTS(SELECT 1 FROM inventory_events WHERE product_id=NEW.product_id) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM inventory_events first JOIN retail_product_versions p ON p.product_id=first.product_id AND p.version=first.product_version WHERE first.product_id=NEW.product_id AND first.sequence=1 AND (p.unit<>NEW.unit OR p.category<>NEW.category)) THEN RAISE(ABORT,'inventory unit locked') END;
END;
CREATE TRIGGER inventory_order_version_lock BEFORE INSERT ON retail_order_versions WHEN (SELECT action FROM inventory_order_events WHERE order_id=NEW.order_id ORDER BY revision DESC LIMIT 1)='reserve' BEGIN SELECT RAISE(ABORT,'release inventory before order revision'); END;
CREATE TRIGGER inventory_events_no_update BEFORE UPDATE ON inventory_events BEGIN SELECT RAISE(ABORT,'inventory history immutable'); END;
CREATE TRIGGER inventory_events_no_delete BEFORE DELETE ON inventory_events BEGIN SELECT RAISE(ABORT,'inventory history immutable'); END;
CREATE TRIGGER inventory_order_events_no_update BEFORE UPDATE ON inventory_order_events BEGIN SELECT RAISE(ABORT,'inventory history immutable'); END;
CREATE TRIGGER inventory_order_events_no_delete BEFORE DELETE ON inventory_order_events BEGIN SELECT RAISE(ABORT,'inventory history immutable'); END;
CREATE TRIGGER inventory_order_lines_no_update BEFORE UPDATE ON inventory_order_lines BEGIN SELECT RAISE(ABORT,'inventory history immutable'); END;
CREATE TRIGGER inventory_order_lines_no_delete BEFORE DELETE ON inventory_order_lines BEGIN SELECT RAISE(ABORT,'inventory history immutable'); END;
