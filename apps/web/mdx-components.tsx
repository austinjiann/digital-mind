import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="text-3xl font-extrabold text-gray-100 mb-6">{children}</h1>
    ),
    h2: ({ children }) => {
      const id = String(children)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      return (
        <h2 id={id} className="text-2xl font-semibold text-gray-100 mt-8 mb-4 scroll-mt-20">
          {children}
        </h2>
      );
    },
    h3: ({ children }) => (
      <h3 className="text-xl font-semibold text-gray-200 mt-6 mb-3">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside text-gray-300 mb-4 space-y-2">{children}</ol>
    ),
    li: ({ children }) => <li className="text-gray-300">{children}</li>,
    a: ({ href, children }) => {
      const isAnchor = href?.startsWith("#");
      return (
        <a
          href={href}
          className={
            isAnchor
              ? "text-gray-300 underline underline-offset-4 decoration-gray-500 hover:text-gray-100 hover:decoration-gray-300 transition-colors"
              : "text-dm-accent hover:underline"
          }
        >
          {children}
        </a>
      );
    },
    code: ({ children }) => (
      <code className="bg-dm-bg px-1.5 py-0.5 rounded text-dm-accent text-sm">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="bg-dm-bg border border-dm-border rounded-lg p-4 overflow-x-auto mb-4">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-dm-accent pl-4 italic text-gray-400 mb-4">
        {children}
      </blockquote>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-gray-200">{children}</strong>
    ),
    em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
    hr: () => <hr className="border-dm-border my-8" />,
    img: ({ src, alt, ...props }) => (
      <img
        src={src}
        alt={alt}
        className="rounded-lg w-full my-6"
        {...props}
      />
    ),
    ...components,
  };
}
