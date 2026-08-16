UPDATE parking_lots
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180;
