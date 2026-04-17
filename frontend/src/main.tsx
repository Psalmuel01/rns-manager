import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { rootstockTestnet } from "./lib/chain";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const config = createConfig({
  chains: [rootstockTestnet],
  connectors: [injected()],
  transports: {
    [rootstockTestnet.id]: http(rootstockTestnet.rpcUrls.default.http[0])
  }
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
