export const ANILIST_SUMMARY_FRAGMENT = /* GraphQL */ `
  fragment AnimeSummary on Media {
    id
    idMal
    title {
      romaji
      english
      native
    }
    episodes
    status
    nextAiringEpisode {
      episode
    }
    season
    seasonYear
    averageScore
    genres
    coverImage {
      extraLarge
      large
      medium
      color
    }
    bannerImage
  }
`;

export const ANILIST_DETAILS_QUERY = /* GraphQL */ `
  query AnimeDetails($idMal: Int!) {
    Media(idMal: $idMal, type: ANIME) {
      ...AnimeSummary
      synonyms
      description(asHtml: false)
      studios(isMain: true) {
        nodes {
          id
          name
        }
      }
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            idMal
            type
            title {
              romaji
              english
              native
            }
            coverImage {
              medium
            }
          }
        }
      }
      externalLinks {
        site
        type
        icon
        isDisabled
      }
      nextAiringEpisode {
        episode
        airingAt
      }
    }
  }
  ${ANILIST_SUMMARY_FRAGMENT}
`;

export const ANILIST_SEARCH_QUERY = /* GraphQL */ `
  query AnimeSearch($search: String!, $page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
      }
      media(type: ANIME, search: $search, isAdult: false) {
        ...AnimeSummary
      }
    }
  }
  ${ANILIST_SUMMARY_FRAGMENT}
`;

export const ANILIST_POPULAR_SUMMARY_QUERY = /* GraphQL */ `
  query PopularSummary($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
      }
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        ...AnimeSummary
      }
    }
  }
  ${ANILIST_SUMMARY_FRAGMENT}
`;

export const ANILIST_POPULAR_QUERY = ANILIST_POPULAR_SUMMARY_QUERY;

export const ANILIST_SEASONAL_QUERY = /* GraphQL */ `
  query Seasonal(
    $season: MediaSeason!
    $seasonYear: Int!
    $page: Int!
    $perPage: Int!
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
      }
      media(
        type: ANIME
        season: $season
        seasonYear: $seasonYear
        sort: POPULARITY_DESC
        isAdult: false
      ) {
        ...AnimeSummary
      }
    }
  }
  ${ANILIST_SUMMARY_FRAGMENT}
`;

export const ANILIST_UPCOMING_QUERY = /* GraphQL */ `
  query Upcoming($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
      }
      media(
        type: ANIME
        status: NOT_YET_RELEASED
        sort: POPULARITY_DESC
        isAdult: false
      ) {
        ...AnimeSummary
      }
    }
  }
  ${ANILIST_SUMMARY_FRAGMENT}
`;

export const ANILIST_COMBINED_HOME_QUERY = /* GraphQL */ `
  query CatalogHome($season: MediaSeason!, $seasonYear: Int!, $perPage: Int!) {
    popular: Page(page: 1, perPage: $perPage) {
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        ...AnimeSummary
      }
    }
    seasonal: Page(page: 1, perPage: $perPage) {
      media(
        type: ANIME
        season: $season
        seasonYear: $seasonYear
        sort: POPULARITY_DESC
        isAdult: false
      ) {
        ...AnimeSummary
      }
    }
    upcoming: Page(page: 1, perPage: $perPage) {
      media(
        type: ANIME
        status: NOT_YET_RELEASED
        sort: POPULARITY_DESC
        isAdult: false
      ) {
        ...AnimeSummary
      }
    }
  }
  ${ANILIST_SUMMARY_FRAGMENT}
`;

export const ANILIST_USER_LIST_QUERY = /* GraphQL */ `
  query AuthenticatedAnimeList($userId: Int!, $chunk: Int!, $perChunk: Int!) {
    MediaListCollection(
      userId: $userId
      type: ANIME
      chunk: $chunk
      perChunk: $perChunk
      sort: UPDATED_TIME_DESC
      forceSingleCompletedList: true
    ) {
      hasNextChunk
      lists {
        entries {
          id
          mediaId
          status
          score(format: POINT_10)
          progress
          updatedAt
          media {
            idMal
            episodes
            status
            nextAiringEpisode {
              episode
            }
          }
        }
      }
    }
  }
`;

export const ANILIST_MEDIA_IDENTITY_QUERY = /* GraphQL */ `
  query AnimeIdentityByMalId($idMal: Int!) {
    Media(idMal: $idMal, type: ANIME) {
      id
      idMal
      episodes
      status
      nextAiringEpisode {
        episode
      }
    }
  }
`;

export const ANILIST_SAVE_USER_LIST_ENTRY_MUTATION = /* GraphQL */ `
  mutation SaveAnimeListEntry(
    $listEntryId: Int
    $mediaId: Int
    $status: MediaListStatus
    $progress: Int
    $scoreRaw: Int
  ) {
    SaveMediaListEntry(
      id: $listEntryId
      mediaId: $mediaId
      status: $status
      progress: $progress
      scoreRaw: $scoreRaw
    ) {
      id
      mediaId
      status
      score(format: POINT_10)
      progress
      updatedAt
      media {
        idMal
        episodes
        status
        nextAiringEpisode {
          episode
        }
      }
    }
  }
`;

export const ANILIST_DELETE_USER_LIST_ENTRY_MUTATION = /* GraphQL */ `
  mutation DeleteAnimeListEntry($listEntryId: Int!) {
    DeleteMediaListEntry(id: $listEntryId) {
      deleted
    }
  }
`;

export const ANILIST_BY_MAL_IDS_QUERY = /* GraphQL */ `
  query AnimeSummariesByMalIds($ids: [Int!]!, $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
      }
      media(type: ANIME, idMal_in: $ids) {
        ...AnimeSummary
      }
    }
  }
  ${ANILIST_SUMMARY_FRAGMENT}
`;
