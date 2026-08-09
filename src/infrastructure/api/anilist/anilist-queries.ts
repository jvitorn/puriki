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
