/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@subreddit-bias/core', '@subreddit-bias/db'],
};

module.exports = nextConfig;
