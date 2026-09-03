interface Link {
  href: string;
  label: string;
  description?: string;
  target?: string;
  rel?: string;
}

export const links: Record<string, Link> = {
  templates: {
    href: "https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app",
    label: "Templates",
    description: "Explore Vercel templates",
    target: "_blank",
    rel: "noopener noreferrer",
  },
  learning: {
    href: "https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app",
    label: "Learning",
    description: "Next.js learning center",
    target: "_blank",
    rel: "noopener noreferrer",
  },
  deploy: {
    href: "https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app",
    label: "Deploy Now",
    description: "Deploy to Vercel",
    target: "_blank",
    rel: "noopener noreferrer",
  },
  docs: {
    href: "https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app",
    label: "Documentation",
    description: "Next.js documentation",
    target: "_blank",
    rel: "noopener noreferrer",
  },
};
