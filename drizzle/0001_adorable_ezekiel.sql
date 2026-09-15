PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`bar_weight` real DEFAULT 45 NOT NULL,
	`handle_weight` real DEFAULT 5 NOT NULL,
	`plate_inventory` text DEFAULT '[{"weight":45,"count":6},{"weight":35,"count":2},{"weight":25,"count":4},{"weight":10,"count":4},{"weight":5,"count":6},{"weight":2.5,"count":4}]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "display_name", "bar_weight", "handle_weight", "plate_inventory", "created_at") SELECT "id", "email", "display_name", "bar_weight", "handle_weight", "plate_inventory", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);