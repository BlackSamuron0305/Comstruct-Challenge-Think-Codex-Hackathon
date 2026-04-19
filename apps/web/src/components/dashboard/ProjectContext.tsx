import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, type ProjectRecord } from "@/lib/api";

export const ALL_PROJECTS = "All projects" as const;
export type ProjectFilter = string;

type Ctx = {
  project: ProjectFilter;
  setProject: (p: ProjectFilter) => void;
  options: ProjectFilter[];
  projects: ProjectRecord[];
};

const ProjectContext = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<ProjectFilter>(ALL_PROJECTS);
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "switcher"],
    queryFn: () => api.get<ProjectRecord[]>("/api/projects"),
  });

  const options = useMemo<ProjectFilter[]>(
    () => [ALL_PROJECTS, ...projects.map((item) => item.name)],
    [projects],
  );

  useEffect(() => {
    if (!options.includes(project)) {
      setProject(ALL_PROJECTS);
    }
  }, [options, project]);

  return (
    <ProjectContext.Provider value={{ project, setProject, options, projects }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
