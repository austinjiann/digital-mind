const createMDX = require("@next/mdx");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@digital-mind/shared"],
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
};

const withMDX = createMDX({});

module.exports = withMDX(nextConfig);
