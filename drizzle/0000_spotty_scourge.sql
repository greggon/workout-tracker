CREATE TABLE `day_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`day_id` text NOT NULL,
	`position` integer NOT NULL,
	`movement_id` text NOT NULL,
	`tool` text NOT NULL,
	`weight` real NOT NULL,
	`pair_movement_id` text,
	`pair_tool` text,
	`pair_weight` real,
	`sets` integer NOT NULL,
	`reps` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pair_movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `day_exercises_day_position_idx` ON `day_exercises` (`day_id`,`position`);--> statement-breakpoint
CREATE TABLE `days` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `days_user_key_unq` ON `days` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `days_user_position_idx` ON `days` (`user_id`,`position`);--> statement-breakpoint
CREATE TABLE `movements` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text,
	`default_tool` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movements_global_name_unq` ON `movements` (`name`) WHERE "movements"."owner_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `movements_owner_name_unq` ON `movements` (`owner_user_id`,`name`) WHERE "movements"."owner_user_id" is not null;--> statement-breakpoint
CREATE INDEX `movements_name_idx` ON `movements` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`day_id` text,
	`day_key` text NOT NULL,
	`day_title` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_mins` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sessions_user_day_started_idx` ON `sessions` (`user_id`,`day_key`,`started_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_started_idx` ON `sessions` (`user_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`day_exercise_id` text,
	`movement_id` text NOT NULL,
	`exercise_index` integer NOT NULL,
	`set_index` integer NOT NULL,
	`slot` integer NOT NULL,
	`tool` text NOT NULL,
	`weight` real NOT NULL,
	`reps` integer NOT NULL,
	`logged_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`day_exercise_id`) REFERENCES `day_exercises`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `set_logs_session_idx` ON `set_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `set_logs_movement_logged_idx` ON `set_logs` (`movement_id`,`logged_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `set_logs_slot_unq` ON `set_logs` (`session_id`,`exercise_index`,`set_index`,`slot`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`bar_weight` real DEFAULT 45 NOT NULL,
	`handle_weight` real DEFAULT 5 NOT NULL,
	`plate_inventory` text DEFAULT '[45,35,25,10,5,2.5]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);