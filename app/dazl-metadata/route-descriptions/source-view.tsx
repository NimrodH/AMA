interface SuggestedRoute {
  title: string;
  uri: string;
}

interface RouteDescription {
  suggestedRoutes: SuggestedRoute[];
  itemTitle: string;
}

export function getRouteDescription(): RouteDescription {
  return {
    suggestedRoutes: [
      {
        title: "מבחן",
        uri: "/sources/bed04453-eec3-46af-8bd7-a3552d414cae/view",
      },
      {
        title: "סכום כלל הקורס",
        uri: "/sources/3f987b9d-e5b0-4999-9b95-e74bcd79ff5e/view",
      },
    ],
    itemTitle: "צפייה במקור",
  };
}
