import { Inbox, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message?: string;
  showUploadLink?: boolean;
}

const EmptyState = ({ icon: Icon = Inbox, message = "Upload data to see analytics.", showUploadLink = true }: EmptyStateProps) => (
  <Card>
    <CardContent className="p-12 text-center">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
      <p className="text-muted-foreground mb-3">{message}</p>
      {showUploadLink && (
        <Link to="/upload">
          <Button variant="outline" size="sm">
            <Upload className="h-3.5 w-3.5 mr-1.5" />Go to Upload Hub
          </Button>
        </Link>
      )}
    </CardContent>
  </Card>
);

export default EmptyState;
