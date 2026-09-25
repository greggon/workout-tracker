DROP INDEX `set_logs_slot_unq`;--> statement-breakpoint
ALTER TABLE `set_logs` ADD `warmup` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `set_logs_slot_unq` ON `set_logs` (`session_id`,`exercise_index`,`warmup`,`set_index`,`slot`);--> statement-breakpoint
ALTER TABLE `day_exercises` ADD `warmups` text DEFAULT '[]' NOT NULL;