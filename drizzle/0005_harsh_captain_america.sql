PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`bar_weight` real DEFAULT 45 NOT NULL,
	`ez_bar_weight` real DEFAULT 30 NOT NULL,
	`plate_inventory` text DEFAULT '[{"weight":45,"count":6,"color":"#000000"},{"weight":35,"count":2,"color":"#000000"},{"weight":25,"count":4,"color":"#000000"},{"weight":10,"count":4,"color":"#000000"},{"weight":5,"count":3,"color":"#000000"},{"weight":2.5,"count":4,"color":"#000000"},{"weight":1,"count":4,"color":"#000000"},{"weight":0.75,"count":4,"color":"#000000"},{"weight":0.5,"count":4,"color":"#000000"},{"weight":0.25,"count":4,"color":"#000000"}]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "display_name", "bar_weight", "ez_bar_weight", "plate_inventory", "created_at") SELECT "id", "email", "display_name", "bar_weight", "ez_bar_weight", "plate_inventory", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);