export const MAL_ANIME_FIELDS = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'mean',
  'rank',
  'popularity',
  'num_list_users',
  'num_scoring_users',
  'nsfw',
  'genres',
  'media_type',
  'status',
  'num_episodes',
  'start_season',
  'broadcast',
  'source',
  'average_episode_duration',
  'rating',
  'studios',
].join(',');

export const MAL_ANIME_DETAIL_FIELDS = `${MAL_ANIME_FIELDS},related_anime`;

export const MAL_DIAGNOSTIC_FIELDS = 'id,title,main_picture';
