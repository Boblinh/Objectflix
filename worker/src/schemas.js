// Central schema definitions for Objectflix API models
import { z } from "zod";

// Basic Show schema
export const Show = z.object({
	id: z.uuid(),
	title: z.string(),
	description: z.string().optional(),
	image: z.url().optional(),
});

// Season schema
export const Season = z.object({
	id: z.uuid(),
	showId: z.uuid(),
	title: z.string(),
	episodeCount: z.number(),
});

// Episode schema
export const Episode = z.object({
	id: z.uuid(),
	seasonId: z.uuid(),
	showId: z.uuid(),
	episodeNumber: z.string().optional(),
	title: z.string(),
	description: z.string().optional(),
	image: z.url().optional(),
	videoUrl: z.url().optional(),
});

// Subtitle schema
export const Subtitle = z.object({
	id: z.uuid(),
	episodeId: z.uuid(),
	language: z.string(),
	url: z.url(),
});

// Search query schema
export const SearchQuery = z.object({
	q: z.string().optional(),
});
