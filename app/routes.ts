import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes";

const devRoutes = import.meta.env.DEV ? prefix("dev", [route("components", "dev/components.tsx")]) : [];

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  index("routes/home.tsx"),
  route("sources", "routes/sources.tsx"),
  route("sources/:id/view", "routes/source-view.tsx"),
  route("cards", "routes/cards.tsx"),
  route("learn", "routes/learn.tsx"),
  route("article-analysis", "routes/article-analysis.tsx"),
  route("summary", "routes/summary.tsx"),
  route("api/summaries", "routes/api.summaries.ts"),
  route("exams", "routes/exams.tsx"),
  route("settings", "routes/settings.tsx"),
  route("setup", "routes/setup.tsx"),
  route("api/next-card-number", "routes/api.next-card-number.ts"),
  route("api/card-feedback", "routes/api.card-feedback.ts"),
  route("api/reupload-source", "routes/api.reupload-source.ts"),
  route("api/refresh-source", "routes/api.refresh-source.ts"),
  route("api/file-status", "routes/api.file-status.ts"),
  route("api/generate-exam-from-source", "routes/api.generate-exam-from-source.ts"),
  route("api/generate-exam-from-course", "routes/api.generate-exam-from-course.ts"),
  route("api/generate-mc-exam", "routes/api.generate-mc-exam.ts"),
  route("api/grade-exam", "routes/api.grade-exam.ts"),
  route("api/delete-exam", "routes/api.delete-exam.ts"),
  route("api/track-learn-session", "routes/api.track-learn-session.ts"),
  route("api/transcribe-image", "routes/api.transcribe-image.ts"),
  route("api/article-sources", "routes/api.article-sources.ts"),
  route("api/article-answers", "routes/api.article-answers.ts"),
  ...devRoutes,
] satisfies RouteConfig;
