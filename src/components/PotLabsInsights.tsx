import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { streamAiChat } from "@/services/aiChatStream";

interface Props {
  dataSummary: string;
  title?: string;
}

const PotLabsInsights = ({ dataSummary, title = "Pot Labs Intelligence" }: Props) => {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setInsights([]);
    let full = "";

    await streamAiChat({
      messages: [
        {
          role: "user",
          content: `Based on this data summary, provide exactly 4 strategic bullet-point insights. Each should be 1-2 sentences. Format as a numbered list (1. 2. 3. 4.). Be specific with numbers and actionable recommendations.\n\nData:\n${dataSummary}`,
        },
      ],
      context: "insights",
      onDelta: (t) => { full += t; },
      onDone: () => {
        const bullets = full
          .split(/\n/)
          .map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim())
          .filter((l) => l.length > 10);
        setInsights(bullets.length > 0 ? bullets : [full]);
        setLoading(false);
      },
      onError: () => {
        setInsights(["Unable to generate insights. Please try again."]);
        setLoading(false);
      },
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="font-display text-sm font-bold">{title}</h3>
          </div>
          <Button size="sm" variant="outline" onClick={generate} disabled={loading} className="text-xs">
            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Generate Insights
          </Button>
        </div>
        {insights.length > 0 ? (
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className="border-l-3 border-accent bg-accent/5 rounded-r-lg p-3 text-sm text-foreground/85 leading-relaxed">
                {ins}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Click "Generate Insights" to get AI-powered strategic analysis.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default PotLabsInsights;
