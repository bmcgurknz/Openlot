-- ATS 1120 Quality Management Requirements alignment.
-- cl 10.1(e): payment schedule item per lot
-- cl 10.4 / 13.8(g): pavement lot start/end lat-long + datum
-- cl 11.1 / 11.6: hold point release recorded with the authorised person
ALTER TABLE lots ADD COLUMN payment_item_number text;
ALTER TABLE lots ADD COLUMN geo_start text;
ALTER TABLE lots ADD COLUMN geo_end text;
ALTER TABLE lots ADD COLUMN geo_datum text;
ALTER TABLE lots ADD COLUMN hold_point_released_by text;
ALTER TABLE lots ADD COLUMN hold_point_released_at date;
