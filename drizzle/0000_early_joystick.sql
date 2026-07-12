CREATE TABLE `mind_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`data` text NOT NULL,
	`view_token` text NOT NULL,
	`edit_token` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mind_maps_view_token_unique` ON `mind_maps` (`view_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `mind_maps_edit_token_unique` ON `mind_maps` (`edit_token`);