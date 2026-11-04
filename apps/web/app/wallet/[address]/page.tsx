import type { Metadata } from "next";
import { ExternalLink, PageTitle } from "@/components/ui";
import { WalletAuditView } from "@/components/wallet-audit-view";
import { shortAddr } from "@/lib/format";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  return { title: ADDRESS.test(address) ? `Wallet ${shortAddr(address)}` : "Wallet X-ray", robots: { index: false } };
}

export default async function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const valid = ADDRESS.test(address);
  return (
    <div className="space-y-6">
      <PageTitle
        title="Wallet X-ray"
        sub={
          valid ? (
            <>
              <span className="num break-all text-fg">{address.toLowerCase()}</span>
              {" · "}
              <ExternalLink href={`https://polymarket.com/profile/${address.toLowerCase()}`}>Polymarket profile</ExternalLink>
            </>
          ) : undefined
        }
      />
      {valid ? (
        <WalletAuditView address={address.toLowerCase()} />
      ) : (
        <p role="alert" className="text-bad">That is not a wallet address. It should start with 0x and have 40 hex characters. Use the search box above.</p>
      )}
    </div>
  );
}
