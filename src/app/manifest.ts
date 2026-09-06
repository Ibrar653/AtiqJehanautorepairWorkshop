import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ATIQ JEHAN AUTO REPAIR",
    short_name: "ATIQ JEHAN",
    description: "Workshop Management System",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/branding/favicon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/branding/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
