CREATE INDEX idx_parking_likes_anonymous_id_parking_lot_id
    ON parking_likes (anonymous_id, parking_lot_id);
