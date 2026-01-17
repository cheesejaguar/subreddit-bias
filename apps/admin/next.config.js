/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@subreddit-bias/core', '@subreddit-bias/db', '@subreddit-bias/llm'],
};

export default nextConfig;
