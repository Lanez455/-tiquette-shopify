import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const recentJobs = await prisma.printJob.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return {
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      labelCount: job.labelCount,
      source: job.source,
      createdAt: job.createdAt.toISOString(),
    })),
  };
};

export default function Home() {
  const { recentJobs } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Étiquettes code-barres">
      <s-section heading="Dernières impressions">
        {recentJobs.length === 0 ? (
          <s-paragraph>Aucune impression pour l'instant.</s-paragraph>
        ) : (
          <s-unordered-list>
            {recentJobs.map((job) => (
              <s-list-item key={job.id}>
                {job.labelCount} étiquettes · {new Date(job.createdAt).toLocaleString("fr-FR")}
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>
    </s-page>
  );
}
