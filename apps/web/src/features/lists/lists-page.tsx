import { Badge, Button, Card, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@fluentui/react-components";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { AddRegular, ClipboardTaskRegular } from "@/lib/fluent-icons";

export const ListsPage = () => {
  const lists = useAsyncResource(() => api.getLists(), []);

  return (
    <>
      <AppShell
        currentRoute="/lists"
        eyebrow="Shared lists"
        title="Shopping, school, and household tasks in one calm surface"
        subtitle="Cards stay generous for wall and tablet use, while the task table keeps ownership and due windows obvious."
        summaryChip="3 active list groups"
        toolbarActions={
          <Button appearance="primary" icon={<AddRegular />} onClick={lists.reload}>
            Refresh lists
          </Button>
        }
      >
        {lists.status === "loading" ? (
          <LoadingState title="Loading lists" message="Checking shopping, school prep, and home routines." />
        ) : lists.status === "error" ? (
          <ErrorState
            title="Lists could not sync"
            message={lists.error.message}
            actionLabel="Retry lists"
            onAction={lists.reload}
          />
        ) : lists.data.lists.length === 0 && lists.data.items.length === 0 ? (
          <EmptyState
            title="Liste in arrivo"
            message="Spesa, compiti e promemoria condivisi arriveranno nelle prossime versioni."
            actionLabel="Ricarica"
            onAction={lists.reload}
          />
        ) : (
          <section className="content-grid content-grid--wide">
            <Card className="panel-card">
              <div className="panel-card__header">
                <div>
                  <p className="eyebrow">Card list</p>
                  <h3>Active family boards</h3>
                </div>
                <Badge appearance="filled" color="brand">
                  Tablet friendly
                </Badge>
              </div>
              <div className="media-grid">
                {lists.data.lists.map((list) => (
                  <article key={list.id} className="media-card">
                    <img src={list.coverImageUrl} alt={list.title} className="media-card__image" />
                    <div className="media-card__body">
                      <div className="media-card__meta">
                        <Badge appearance="filled">{list.itemCount} items</Badge>
                        <span>{list.title}</span>
                      </div>
                      <h4>{list.title}</h4>
                      <p>{list.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </Card>

            <Card className="panel-card">
              <div className="panel-card__header">
                <div>
                  <p className="eyebrow">Task table</p>
                  <h3>Approved sample tasks</h3>
                </div>
                <Button appearance="subtle" icon={<ClipboardTaskRegular />}>Open bulk view</Button>
              </div>
              <Table aria-label="Shared list items table">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Task</TableHeaderCell>
                    <TableHeaderCell>Owner</TableHeaderCell>
                    <TableHeaderCell>Due</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lists.data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.task}</TableCell>
                      <TableCell>
                        <div className="identity-cell">
                          <img src={item.ownerAvatarUrl} alt={item.ownerName} className="avatar-thumb" />
                          <span>{item.ownerName}</span>
                        </div>
                      </TableCell>
                      <TableCell>{item.due}</TableCell>
                      <TableCell>{item.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        )}
      </AppShell>
    </>
  );
};