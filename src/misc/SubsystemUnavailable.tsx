import { AlertCircle } from "lucide-react";

interface SubsystemUnavailableProps {
  featureName: string;
  explanation: string;
  technicalDetails?: string;
}

export function SubsystemUnavailable({
  featureName,
  explanation,
  technicalDetails,
}: SubsystemUnavailableProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-8">
      <div className="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-base-content/30" />
      </div>
      <div className="text-center max-w-md">
        <h3 className="text-lg font-medium text-base-content/80 mb-2">
          {featureName}は利用できません
        </h3>
        <p className="text-sm text-base-content/50">{explanation}</p>
      </div>
      {technicalDetails && (
        <details className="text-sm text-base-content/30 mt-2">
          <summary className="cursor-pointer hover:text-base-content/50">
            技術的な詳細
          </summary>
          <code className="block mt-1 bg-base-200 rounded p-2">
            {technicalDetails}
          </code>
        </details>
      )}
    </div>
  );
}
