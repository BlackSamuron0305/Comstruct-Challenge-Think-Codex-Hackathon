import { createContext, useContext, useState, type ReactNode } from "react";
import { projects } from "@/lib/mock-data";

export const ALL_PROJECTS = "All projects" as const;
export type ProjectFilter = typeof ALL_PROJECTS | (typeof projects)[number];

type Ctx = {
  project: ProjectFilter;
  setProject: (p: ProjectFilter) => void;
  options: ProjectFilter[];
};

const ProjectContext = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<ProjectFilter>(ALL_PROJECTS);
  const options: ProjectFilter[] = [ALL_PROJECTS, ...projects];
  return (
    <ProjectContext.Provider value={{ project, setProject, options }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
