import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { Landing } from "./routes/Landing";
import { Desk } from "./routes/Desk";
import { Radar } from "./routes/Radar";
import { PositionDetail } from "./routes/PositionDetail";
import { TokenDetail } from "./routes/TokenDetail";
import { WalletDetail } from "./routes/WalletDetail";
import { Docs } from "./routes/Docs";
import { Token } from "./routes/Token";
import { NotFound } from "./routes/NotFound";

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/desk" element={<Desk />} />
        <Route path="/radar" element={<Radar />} />
        <Route path="/token/:address" element={<TokenDetail />} />
        <Route path="/wallet/:address" element={<WalletDetail />} />
        <Route path="/positions/:id" element={<PositionDetail />} />
        <Route path="/isx" element={<Token />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}
