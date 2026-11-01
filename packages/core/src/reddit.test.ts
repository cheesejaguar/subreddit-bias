import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import {
  RedditClient,
  createRedditClient,
  RedditApiError,
  RedditRateLimitError,
  RedditNotFoundError,
} from './reddit';

describe('RedditClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const emptyListing = { kind: 'Listing', data: { children: [], after: null, before: null } };

  const stubFetchOk = (body: unknown) => {
    const fetchMock = mock((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };

  const requestedUrl = (fetchMock: ReturnType<typeof stubFetchOk>, call = 0) =>
    fetchMock.mock.calls[call][0];

  const requestedHeaders = (fetchMock: ReturnType<typeof stubFetchOk>, call = 0) =>
    fetchMock.mock.calls[call][1]?.headers as Record<string, string>;

  test('creates client that sends the default user agent', async () => {
    const fetchMock = stubFetchOk(emptyListing);
    const client = createRedditClient();
    expect(client).toBeInstanceOf(RedditClient);

    await client.getPosts('test', 'top');

    expect(requestedHeaders(fetchMock)['User-Agent']).toBe('SubredditBiasAnalyzer/1.0.0');
  });

  test('creates client that sends a custom user agent', async () => {
    const fetchMock = stubFetchOk(emptyListing);
    const client = createRedditClient('CustomAgent/1.0');

    await client.getPosts('test', 'top');

    expect(requestedHeaders(fetchMock)['User-Agent']).toBe('CustomAgent/1.0');
  });

  describe('getPosts', () => {
    test('parses Reddit API response correctly', async () => {
      const mockResponse = {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'abc123',
                subreddit: 'test',
                title: 'Test Post',
                permalink: '/r/test/comments/abc123/test_post/',
                created_utc: 1704067200,
                score: 100,
                num_comments: 50,
                removed_by_category: null,
                author: 'testuser',
              },
            },
          ],
          after: 't3_xyz789',
          before: null,
        },
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const client = createRedditClient();
      const result = await client.getPosts('test', 'top');

      expect((globalThis.fetch as any).mock.calls[0][0]).toBe(
        'https://www.reddit.com/r/test/top.json?limit=25&t=week'
      );
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].id).toBe('abc123');
      expect(result.posts[0].subreddit).toBe('test');
      expect(result.posts[0].title).toBe('Test Post');
      expect(result.posts[0].score).toBe(100);
      expect(result.posts[0].numComments).toBe(50);
      expect(result.posts[0].isRemoved).toBe(false);
      expect(result.after).toBe('t3_xyz789');
    });

    test('handles removed posts', async () => {
      const mockResponse = {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'removed123',
                subreddit: 'test',
                title: '[removed]',
                permalink: '/r/test/comments/removed123/',
                created_utc: 1704067200,
                score: 0,
                num_comments: 0,
                removed_by_category: 'moderator',
                author: '[deleted]',
              },
            },
          ],
          after: null,
          before: null,
        },
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const client = createRedditClient();
      const result = await client.getPosts('test', 'new');

      // 'new' listings have no timeframe parameter
      expect((globalThis.fetch as any).mock.calls[0][0]).toBe(
        'https://www.reddit.com/r/test/new.json?limit=25'
      );
      expect(result.posts[0].isRemoved).toBe(true);
    });

    test('throws RedditRateLimitError on 429', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 429,
        } as Response)
      );

      const client = createRedditClient();
      await expect(client.getPosts('test', 'top')).rejects.toThrow(RedditRateLimitError);
    });

    test('throws RedditNotFoundError on 404', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response)
      );

      const client = createRedditClient();
      await expect(client.getPosts('nonexistent', 'top')).rejects.toThrow(RedditNotFoundError);
    });

    test('passes limit, timeframe and after cursor in the URL', async () => {
      const fetchMock = stubFetchOk(emptyListing);
      const client = createRedditClient();

      await client.getPosts('test', 'controversial', { limit: 7, timeframe: 'month', after: 't3_abc' });

      expect(requestedUrl(fetchMock)).toBe(
        'https://www.reddit.com/r/test/controversial.json?limit=7&t=month&after=t3_abc'
      );
    });

    test('throws RedditApiError on other errors', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as Response)
      );

      const client = createRedditClient();
      await expect(client.getPosts('test', 'top')).rejects.toThrow('Reddit API error: 500');
    });
  });

  describe('getAllPosts', () => {
    test('paginates to get all posts', async () => {
      let callCount = 0;

      globalThis.fetch = mock(() => {
        callCount++;
        const isFirstCall = callCount === 1;

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              kind: 'Listing',
              data: {
                children: Array.from({ length: 10 }, (_, i) => ({
                  kind: 't3',
                  data: {
                    id: `post_${callCount}_${i}`,
                    subreddit: 'test',
                    title: `Post ${i}`,
                    permalink: `/r/test/comments/post_${callCount}_${i}/`,
                    created_utc: 1704067200,
                    score: 100,
                    num_comments: 50,
                    removed_by_category: null,
                    author: 'user',
                  },
                })),
                after: isFirstCall ? 't3_next' : null,
                before: null,
              },
            }),
        } as Response);
      });

      const client = createRedditClient();
      const posts = await client.getAllPosts('test', 'top', { maxPosts: 15 });

      expect(posts).toHaveLength(15);
      expect(callCount).toBe(2);
      const calls = (globalThis.fetch as any).mock.calls;
      expect(calls[0][0]).toBe('https://www.reddit.com/r/test/top.json?limit=15&t=week');
      // Second page asks only for the remaining posts, starting after the cursor
      expect(calls[1][0]).toBe('https://www.reddit.com/r/test/top.json?limit=5&t=week&after=t3_next');
    });

    test('respects maxPosts limit', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              kind: 'Listing',
              data: {
                children: Array.from({ length: 100 }, (_, i) => ({
                  kind: 't3',
                  data: {
                    id: `post_${i}`,
                    subreddit: 'test',
                    title: `Post ${i}`,
                    permalink: `/r/test/comments/post_${i}/`,
                    created_utc: 1704067200,
                    score: 100,
                    num_comments: 50,
                    removed_by_category: null,
                    author: 'user',
                  },
                })),
                after: 't3_next',
                before: null,
              },
            }),
        } as Response)
      );

      const client = createRedditClient();
      const posts = await client.getAllPosts('test', 'new', { maxPosts: 50 });

      expect(posts).toHaveLength(50);
      expect((globalThis.fetch as any).mock.calls).toHaveLength(1);
    });
  });

  describe('getPostComments', () => {
    test('parses nested comments correctly', async () => {
      const mockResponse = [
        // Post data (first element)
        {
          kind: 'Listing',
          data: { children: [], after: null, before: null },
        },
        // Comments data (second element)
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'comment1',
                  link_id: 't3_abc123',
                  parent_id: 't3_abc123',
                  subreddit: 'test',
                  permalink: '/r/test/comments/abc123/test/comment1/',
                  author: 'user1',
                  author_fullname: 't2_user1',
                  body: 'Top level comment',
                  created_utc: 1704067200,
                  edited: false,
                  score: 10,
                  depth: 0,
                  removed: false,
                  distinguished: null,
                  replies: {
                    kind: 'Listing',
                    data: {
                      children: [
                        {
                          kind: 't1',
                          data: {
                            id: 'comment2',
                            link_id: 't3_abc123',
                            parent_id: 't1_comment1',
                            subreddit: 'test',
                            permalink: '/r/test/comments/abc123/test/comment2/',
                            author: 'user2',
                            body: 'Reply comment',
                            created_utc: 1704068200,
                            edited: 1704070000,
                            score: 5,
                            depth: 1,
                            removed: false,
                            distinguished: null,
                            replies: '',
                          },
                        },
                      ],
                      after: null,
                      before: null,
                    },
                  },
                },
              },
            ],
            after: null,
            before: null,
          },
        },
      ];

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const client = createRedditClient();
      const comments = await client.getPostComments('test', 'abc123');

      expect((globalThis.fetch as any).mock.calls[0][0]).toBe(
        'https://www.reddit.com/r/test/comments/abc123.json?limit=500&depth=10&sort=top'
      );
      expect(comments).toHaveLength(2);

      // Top level comment
      expect(comments[0].id).toBe('comment1');
      expect(comments[0].parentId).toBeNull();
      expect(comments[0].depth).toBe(0);
      expect(comments[0].body).toBe('Top level comment');
      expect(comments[0].editedUtc).toBeNull();
      expect(comments[0].isModerator).toBe(false);
      expect(comments[0].postId).toBe('abc123');
      expect(comments[0].authorId).toBe('t2_user1');

      // Reply comment
      expect(comments[1].id).toBe('comment2');
      expect(comments[1].parentId).toBe('comment1');
      expect(comments[1].depth).toBe(1);
      expect(comments[1].editedUtc).toBe(1704070000);
      // Falls back to the username when author_fullname is absent
      expect(comments[1].authorId).toBe('user2');
    });

    test('identifies deleted and removed comments', async () => {
      const mockResponse = [
        { kind: 'Listing', data: { children: [], after: null, before: null } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'deleted1',
                  link_id: 't3_abc123',
                  parent_id: 't3_abc123',
                  subreddit: 'test',
                  permalink: '/r/test/comments/abc123/test/deleted1/',
                  author: '[deleted]',
                  body: '[deleted]',
                  created_utc: 1704067200,
                  edited: false,
                  score: 1,
                  depth: 0,
                  removed: false,
                  distinguished: null,
                  replies: '',
                },
              },
              {
                kind: 't1',
                data: {
                  id: 'removed1',
                  link_id: 't3_abc123',
                  parent_id: 't3_abc123',
                  subreddit: 'test',
                  permalink: '/r/test/comments/abc123/test/removed1/',
                  author: 'someuser',
                  body: '[removed]',
                  created_utc: 1704067200,
                  edited: false,
                  score: 1,
                  depth: 0,
                  removed: true,
                  distinguished: null,
                  replies: '',
                },
              },
            ],
            after: null,
            before: null,
          },
        },
      ];

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const client = createRedditClient();
      const comments = await client.getPostComments('test', 'abc123');

      expect(comments[0].isDeleted).toBe(true);
      expect(comments[0].isRemoved).toBe(false);
      expect(comments[1].isDeleted).toBe(false);
      expect(comments[1].isRemoved).toBe(true);
    });

    test('identifies moderator comments', async () => {
      const mockResponse = [
        { kind: 'Listing', data: { children: [], after: null, before: null } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'modcomment',
                  link_id: 't3_abc123',
                  parent_id: 't3_abc123',
                  subreddit: 'test',
                  permalink: '/r/test/comments/abc123/test/modcomment/',
                  author: 'moduser',
                  body: 'Official mod statement',
                  created_utc: 1704067200,
                  edited: false,
                  score: 100,
                  depth: 0,
                  removed: false,
                  distinguished: 'moderator',
                  replies: '',
                },
              },
            ],
            after: null,
            before: null,
          },
        },
      ];

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const client = createRedditClient();
      const comments = await client.getPostComments('test', 'abc123');

      expect(comments[0].isModerator).toBe(true);
    });
  });

  describe('getModerators', () => {
    test('returns list of moderator names', async () => {
      const mockResponse = {
        data: {
          children: [{ name: 'mod1' }, { name: 'mod2' }, { name: 'mod3' }],
        },
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      );

      const client = createRedditClient();
      const mods = await client.getModerators('test');

      expect((globalThis.fetch as any).mock.calls[0][0]).toBe(
        'https://www.reddit.com/r/test/about/moderators.json'
      );
      expect(mods).toEqual(['mod1', 'mod2', 'mod3']);
    });

    test('rethrows errors other than not-found', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 429,
        } as Response)
      );

      const client = createRedditClient();
      await expect(client.getModerators('test')).rejects.toThrow(RedditRateLimitError);
    });

    test('returns empty array if mod list is private', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response)
      );

      const client = createRedditClient();
      const mods = await client.getModerators('privatesubreddit');

      expect(mods).toEqual([]);
    });
  });

  describe('subredditExists', () => {
    test('returns true for existing subreddit', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { display_name: 'test' } }),
        } as Response)
      );

      const client = createRedditClient();
      const exists = await client.subredditExists('test');

      expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://www.reddit.com/r/test/about.json');
      expect(exists).toBe(true);
    });

    test('returns false for non-existent subreddit', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response)
      );

      const client = createRedditClient();
      const exists = await client.subredditExists('nonexistent');

      expect(exists).toBe(false);
    });

    test('rethrows server errors instead of reporting the subreddit missing', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 503,
        } as Response)
      );

      const client = createRedditClient();
      await expect(client.subredditExists('test')).rejects.toThrow('Reddit API error: 503');
    });
  });
});

describe('Error classes', () => {
  test('RedditApiError has correct name', () => {
    const error = new RedditApiError('test error');
    expect(error.name).toBe('RedditApiError');
    expect(error.message).toBe('test error');
  });

  test('RedditRateLimitError has correct name', () => {
    const error = new RedditRateLimitError('rate limited');
    expect(error.name).toBe('RedditRateLimitError');
    expect(error).toBeInstanceOf(RedditApiError);
  });

  test('RedditNotFoundError has correct name', () => {
    const error = new RedditNotFoundError('not found');
    expect(error.name).toBe('RedditNotFoundError');
    expect(error).toBeInstanceOf(RedditApiError);
  });
});
