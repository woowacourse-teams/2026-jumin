CREATE TABLE parking_likes
(
    parking_lot_id BIGINT NOT NULL,
    anonymous_id   UUID NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_parking_likes PRIMARY KEY (parking_lot_id, anonymous_id),
    CONSTRAINT fk_parking_likes_parking_lot
        FOREIGN KEY (parking_lot_id)
            REFERENCES parking_lots (id)
            ON DELETE RESTRICT
);
