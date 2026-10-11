CREATE TABLE family_booking_changes(
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES family_request_roots(id),
 store_id TEXT NOT NULL REFERENCES stores(id), customer_id TEXT NOT NULL REFERENCES customers(id),
 recipient_id TEXT NOT NULL REFERENCES users(id), booking_id TEXT NOT NULL REFERENCES schedule_bookings(id),
 publication_id TEXT NOT NULL REFERENCES family_booking_roots(id), publication_version_id TEXT NOT NULL REFERENCES family_booking_versions(id),
 kind TEXT NOT NULL CHECK(kind IN('leave','move')), booking_snapshot_json TEXT NOT NULL CHECK(json_valid(booking_snapshot_json)),
 offer_id TEXT REFERENCES family_offer_roots(id), offer_version_id TEXT REFERENCES family_offer_versions(id), target_snapshot_json TEXT CHECK(json_valid(target_snapshot_json)),
 schedule_prefix INTEGER NOT NULL CHECK(schedule_prefix>0), booking_prefix INTEGER NOT NULL CHECK(booking_prefix>0),
 offer_prefix INTEGER NOT NULL CHECK(offer_prefix>=0), request_prefix INTEGER NOT NULL CHECK(request_prefix>0),
 created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
 CHECK((kind='leave' AND offer_id IS NULL AND offer_version_id IS NULL AND target_snapshot_json IS NULL) OR
       (kind='move' AND offer_id IS NOT NULL AND offer_version_id IS NOT NULL AND target_snapshot_json IS NOT NULL))
);
CREATE TABLE family_booking_change_executions(
 id TEXT PRIMARY KEY, change_id TEXT NOT NULL UNIQUE REFERENCES family_booking_changes(id),
 store_id TEXT NOT NULL REFERENCES stores(id), booking_event_id TEXT NOT NULL UNIQUE REFERENCES schedule_booking_events(id),
 action TEXT NOT NULL CHECK(action IN('leave','move','promote')), request_revision INTEGER NOT NULL CHECK(request_revision>0), request_prefix INTEGER NOT NULL CHECK(request_prefix>0),
 booking_prefix INTEGER NOT NULL CHECK(booking_prefix>0), offer_prefix INTEGER NOT NULL CHECK(offer_prefix>=0),
 result_publication_id TEXT NOT NULL UNIQUE REFERENCES family_booking_roots(id), created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE TRIGGER family_change_source BEFORE INSERT ON family_booking_changes BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM family_request_roots q JOIN family_request_current qe ON qe.root_id=q.id
  JOIN family_booking_roots p ON p.id=NEW.publication_id JOIN family_booking_current pe ON pe.root_id=p.id
  JOIN family_booking_versions v ON v.id=pe.version_id JOIN family_request_roots original ON original.id=p.request_id
  JOIN family_request_current oq ON oq.root_id=original.id
  JOIN schedule_bookings b ON b.id=p.booking_id JOIN schedule_current_bookings e ON e.booking_id=b.id
  JOIN users u ON u.id=q.recipient_id JOIN guardian_links g ON g.user_id=u.id AND g.customer_id=q.customer_id
  LEFT JOIN user_security z ON z.user_id=u.id
  WHERE q.id=NEW.request_id AND q.store_id=NEW.store_id AND q.customer_id=NEW.customer_id AND q.recipient_id=NEW.recipient_id
   AND q.created_at=NEW.created_at AND q.created_by=NEW.created_by AND NEW.created_by=NEW.recipient_id
   AND qe.action='submit' AND qe.revision=1 AND qe.created_at=NEW.created_at AND qe.created_by=NEW.created_by
   AND original.recipient_id=q.recipient_id AND original.customer_id=q.customer_id
   AND b.id=NEW.booking_id AND b.store_id=q.store_id AND b.customer_id=q.customer_id
   AND pe.status='published' AND v.id=NEW.publication_version_id AND v.booking_snapshot_json=NEW.booking_snapshot_json
   AND json_extract(v.booking_snapshot_json,'$.event_id')=e.id AND e.status<>'cancelled'
   AND json_extract(v.request_snapshot_json,'$.event_id')=oq.id
   AND u.active=1 AND u.role='guardian' AND g.active=1 AND coalesce(z.must_change_password,0)=0
   AND q.time_status='recorded'
   AND (NEW.kind='leave' AND e.status='booked' AND q.request_kind='leave'
        AND q.requested_start=json_extract(NEW.booking_snapshot_json,'$.starts_at') AND q.requested_end=json_extract(NEW.booking_snapshot_json,'$.ends_at')
    OR NEW.kind='move' AND q.request_kind='appointment' AND EXISTS(
     SELECT 1 FROM family_offer_roots o JOIN family_offer_current oe ON oe.root_id=o.id JOIN family_offer_versions ov ON ov.id=oe.version_id
     JOIN family_offer_sources s ON s.plan_id=o.plan_id AND s.slot_id=o.slot_id
     WHERE o.id=NEW.offer_id AND ov.id=NEW.offer_version_id AND oe.status='published' AND ov.snapshot_json=NEW.target_snapshot_json
      AND o.recipient_id=q.recipient_id AND o.customer_id=q.customer_id AND o.store_id=q.store_id AND o.plan_id=b.plan_id
      AND s.plan_status='active' AND s.plan_version=b.plan_version
      AND s.plan_event_id=json_extract(ov.snapshot_json,'$.plan_event_id') AND s.slot_event_id=json_extract(ov.snapshot_json,'$.slot_event_id')
      AND q.requested_start=s.starts_at AND q.requested_end=s.ends_at AND (o.slot_id<>e.slot_id OR e.status='waiting')
      AND NOT EXISTS(SELECT 1 FROM json_each(s.resources_json) j LEFT JOIN schedule_current_resources r ON r.resource_id=json_extract(j.value,'$.id')
       LEFT JOIN users staff ON staff.id=r.user_id LEFT JOIN user_security sec ON sec.user_id=staff.id
       WHERE r.resource_id IS NULL OR r.version<>json_extract(j.value,'$.version') OR r.status<>'active' OR r.capacity<s.capacity
        OR r.kind='staff' AND (staff.active<>1 OR staff.role<>'professional' OR coalesce(sec.must_change_password,0)<>0))
    ))
 ) OR NEW.schedule_prefix<>(SELECT max(sequence) FROM schedule_journal WHERE store_id=NEW.store_id)
  OR NEW.booking_prefix<>(SELECT max(sequence) FROM family_booking_events WHERE store_id=NEW.store_id)
  OR NEW.offer_prefix<>coalesce((SELECT max(sequence) FROM family_offer_events WHERE store_id=NEW.store_id),0)
  OR NEW.request_prefix<>(SELECT max(sequence) FROM family_request_events WHERE store_id=NEW.store_id)
  OR EXISTS(SELECT 1 FROM family_booking_changes c JOIN family_request_current q ON q.root_id=c.request_id
   WHERE c.booking_id=NEW.booking_id AND c.recipient_id=NEW.recipient_id AND q.status NOT IN('withdrawn','closed')
    AND NOT EXISTS(SELECT 1 FROM family_booking_change_executions e WHERE e.change_id=c.id))
 THEN RAISE(ABORT,'family booking change fixed named original/target/current source') END;
END;
CREATE TRIGGER family_change_execution_source BEFORE INSERT ON family_booking_change_executions BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM family_booking_changes c JOIN family_request_current q ON q.root_id=c.request_id
  JOIN schedule_booking_events e ON e.id=NEW.booking_event_id JOIN schedule_current_bookings cur ON cur.booking_id=c.booking_id
  JOIN family_booking_current old ON old.root_id=c.publication_id
  JOIN family_booking_roots original ON original.id=c.publication_id JOIN family_booking_versions ov ON ov.id=old.version_id
  JOIN family_request_current original_request ON original_request.root_id=original.request_id
  JOIN family_booking_roots result ON result.id=NEW.result_publication_id
  JOIN family_booking_current rc ON rc.root_id=result.id JOIN family_booking_versions rv ON rv.id=rc.version_id
  JOIN users u ON u.id=c.recipient_id JOIN guardian_links g ON g.user_id=u.id AND g.customer_id=c.customer_id
  LEFT JOIN user_security z ON z.user_id=u.id
  WHERE c.id=NEW.change_id AND c.store_id=NEW.store_id AND q.status NOT IN('withdrawn','closed') AND q.revision=NEW.request_revision
   AND e.booking_id=c.booking_id AND e.store_id=c.store_id AND cur.id=e.id AND e.action=NEW.action
   AND e.previous_event_id=json_extract(c.booking_snapshot_json,'$.event_id') AND e.revision=json_extract(c.booking_snapshot_json,'$.revision')+1
   AND e.created_at=NEW.created_at AND e.created_by=NEW.created_by
   AND old.status='published' AND old.version_id=c.publication_version_id
   AND json_extract(ov.request_snapshot_json,'$.event_id')=original_request.id
   AND u.active=1 AND u.role='guardian' AND g.active=1 AND coalesce(z.must_change_password,0)=0
   AND result.request_id=c.request_id AND result.booking_id=c.booking_id AND result.store_id=c.store_id
   AND result.created_at=NEW.created_at AND result.created_by=NEW.created_by AND rc.status='published' AND rv.version=1
   AND json_extract(rv.booking_snapshot_json,'$.event_id')=e.id
   AND (c.kind='leave' AND NEW.action='leave' AND json_extract(c.booking_snapshot_json,'$.status')='booked'
    OR c.kind='move' AND e.slot_id=json_extract(c.target_snapshot_json,'$.slot_id') AND e.slot_revision=json_extract(c.target_snapshot_json,'$.slot_revision')
     AND e.plan_revision=json_extract(c.target_snapshot_json,'$.plan_revision')
     AND (NEW.action='move' AND e.slot_id<>json_extract(c.booking_snapshot_json,'$.slot_id')
      OR NEW.action='promote' AND json_extract(c.booking_snapshot_json,'$.status')='waiting' AND e.slot_id=json_extract(c.booking_snapshot_json,'$.slot_id'))
     AND EXISTS(SELECT 1 FROM family_offer_current oe WHERE oe.root_id=c.offer_id AND oe.status='published' AND oe.version_id=c.offer_version_id))
 ) OR NEW.request_prefix<>(SELECT max(sequence) FROM family_request_events WHERE store_id=NEW.store_id)
  OR NEW.booking_prefix<>(SELECT max(sequence) FROM family_booking_events WHERE store_id=NEW.store_id)
  OR NEW.offer_prefix<>coalesce((SELECT max(sequence) FROM family_offer_events WHERE store_id=NEW.store_id),0)
  OR NOT EXISTS(SELECT 1 FROM users u LEFT JOIN user_security z ON z.user_id=u.id WHERE u.id=NEW.created_by AND u.store_id=NEW.store_id
   AND u.active=1 AND u.role IN('manager','reception') AND coalesce(z.must_change_password,0)=0)
 THEN RAISE(ABORT,'family booking change actual paired original event/publication') END;
END;
CREATE TRIGGER family_changes_time BEFORE INSERT ON family_booking_changes WHEN length(NEW.created_at)<>24 OR strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at) IS NOT NEW.created_at
 OR EXISTS(SELECT 1 FROM schedule_journal WHERE store_id=NEW.store_id AND created_at>NEW.created_at)
 OR EXISTS(SELECT 1 FROM family_booking_events WHERE store_id=NEW.store_id AND created_at>NEW.created_at)
 OR EXISTS(SELECT 1 FROM family_offer_events WHERE store_id=NEW.store_id AND created_at>NEW.created_at)
 BEGIN SELECT RAISE(ABORT,'family booking change canonical current time');END;
CREATE TRIGGER family_change_executions_time BEFORE INSERT ON family_booking_change_executions WHEN length(NEW.created_at)<>24 OR strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at) IS NOT NEW.created_at
 BEGIN SELECT RAISE(ABORT,'family booking change execution canonical time');END;
CREATE TRIGGER family_changes_no_update BEFORE UPDATE ON family_booking_changes BEGIN SELECT RAISE(ABORT,'family booking change immutable');END;
CREATE TRIGGER family_changes_no_delete BEFORE DELETE ON family_booking_changes BEGIN SELECT RAISE(ABORT,'family booking change immutable');END;
CREATE TRIGGER family_change_executions_no_update BEFORE UPDATE ON family_booking_change_executions BEGIN SELECT RAISE(ABORT,'family booking change execution immutable');END;
CREATE TRIGGER family_change_executions_no_delete BEFORE DELETE ON family_booking_change_executions BEGIN SELECT RAISE(ABORT,'family booking change execution immutable');END;
