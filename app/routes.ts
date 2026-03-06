import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes";

const devRoutes = import.meta.env.DEV ? prefix("dev", [route("components", "dev/components.tsx")]) : [];

export default [
  index("routes/home.tsx"),
  route("sources", "routes/sources.tsx"),
  route("cards", "routes/cards.tsx"),
  route("exams", "routes/exams.tsx"),
  route("settings", "routes/settings.tsx"),
  route("setup", "routes/setup.tsx"),
  ...devRoutes,
] satisfies RouteConfig;
