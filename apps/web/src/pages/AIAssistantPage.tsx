import { AIAssistantChat } from '../components/AIAssistantChat';

export function AIAssistantPage(): JSX.Element {
  return (
    <div className="h-[calc(100vh-3rem)]">
      <AIAssistantChat mode="page" />
    </div>
  );
}
