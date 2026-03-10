import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes";

const devRoutes = import.meta.env.DEV ? prefix("dev", [route("components", "dev/components.tsx")]) : [];

export default [
  index("routes/home.tsx"),
  route("sources", "routes/sources.tsx"),
  route("sources/:id/view", "routes/source-view.tsx"),
  route("cards", "routes/cards.tsx"),
  route("learn", "routes/learn.tsx"),
  route("exams", "routes/exams.tsx"),
  route("settings", "routes/settings.tsx"),
  route("setup", "routes/setup.tsx"),
  route("api/next-card-number", "routes/api.next-card-number.ts"),
  ...devRoutes,
] satisfies RouteConfig;
