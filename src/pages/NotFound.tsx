import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Activity } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
            <Activity className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h1 className="mb-2 font-display text-5xl font-bold">404</h1>
        <p className="mb-6 text-lg text-muted-foreground">Page not found</p>
        <a href="/" className="text-primary font-medium hover:underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
