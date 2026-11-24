
import { z } from "zod";

export const Show = z.object({
	id: z.uuid(),
	title: z.string(),
	description: z.string().optional(),
	image: z.url().optional(),
});

export const Season = z.object({
	id: z.uuid(),
	showId: z.uuid(),
	title: z.string(),
	episodeCount: z.number(),
});

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

export const Subtitle = z.object({
	id: z.uuid(),
	episodeId: z.uuid(),
	language: z.string(),
	url: z.url(),
	attribution: z.string().optional(),
});

export const SearchQuery = z.object({
	q: z.string().optional(),
});
