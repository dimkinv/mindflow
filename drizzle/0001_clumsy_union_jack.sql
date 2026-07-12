ALTER TABLE `mind_maps` ADD `owner_email` text;--> statement-breakpoint
CREATE INDEX `mind_maps_owner_updated_idx` ON `mind_maps` (`owner_email`,`updated_at`);