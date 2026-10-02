import { Button, Card, Spinner } from "@fluentui/react-components";
import { AlertRegular, ArrowClockwiseRegular, BoxRegular, SparkleRegular } from "@/lib/fluent-icons";

interface StateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const LoadingState = ({ title, message }: StateProps) => (
  <Card className="state-card">
    <Spinner size="large" label={title} />
    <p>{message}</p>
    <div className="skeleton-grid">
      <div className="skeleton-block" />
      <div className="skeleton-block" />
      <div className="skeleton-block" />
    </div>
  </Card>
);

export const ErrorState = ({ title, message, actionLabel, onAction }: StateProps) => (
  <Card className="state-card state-card--error">
    <div className="state-card__icon"><AlertRegular /></div>
    <h3>{title}</h3>
    <p>{message}</p>
    {actionLabel && onAction ? (
      <Button appearance="primary" icon={<ArrowClockwiseRegular />} onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </Card>
);

export const EmptyState = ({ title, message, actionLabel, onAction }: StateProps) => (
  <Card className="state-card state-card--empty">
    <div className="state-card__icon"><BoxRegular /></div>
    <h3>{title}</h3>
    <p>{message}</p>
    {actionLabel && onAction ? (
      <Button appearance="primary" icon={<SparkleRegular />} onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </Card>
);