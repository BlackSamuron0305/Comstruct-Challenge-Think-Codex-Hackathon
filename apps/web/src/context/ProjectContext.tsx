import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { PROJECTS, type ProjectRecord } from '../lib/mockData';

type ProjectContextValue = {
  projects: ProjectRecord[];
  selectedProjectId: string;
  selectedProject: ProjectRecord;
  setSelectedProjectId: (projectId: string) => void;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }): JSX.Element {
  const [selectedProjectId, setSelectedProjectId] = useState(PROJECTS[0]?.id ?? '');

  const value = useMemo(() => {
    const selectedProject = PROJECTS.find((project) => project.id === selectedProjectId) ?? PROJECTS[0];
    if (!selectedProject) {
      throw new Error('No projects configured for project context.');
    }

    return {
      projects: PROJECTS,
      selectedProjectId: selectedProject.id,
      selectedProject,
      setSelectedProjectId,
    };
  }, [selectedProjectId]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) {
    throw new Error('useProjectContext must be used inside ProjectProvider.');
  }
  return value;
}
