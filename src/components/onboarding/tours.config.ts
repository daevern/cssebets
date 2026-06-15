export type TourStep = {
  target: string; // data-tour value or 'body'
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
};

export type TourDef = {
  key: string;
  route: string;
  label: string;
  steps: TourStep[];
};

export const TOURS: Record<string, TourDef> = {
  essentials: {
    key: "essentials",
    route: "/dashboard",
    label: "The essentials",
    steps: [
      {
        target: "wallet-balance",
        title: "Your points balance",
        body: "Always visible at the top. This is what you bet with.",
      },
      {
        target: "quick-actions",
        title: "Bet and find your picks",
        body: "Tap BET to place a wager on a match. Tap PICKS to see your active and settled bets.",
      },
      {
        target: "help-link",
        title: "Need help later?",
        body: "Open the Help Center any time to request points, request a payout, or replay this tour.",
      },
    ],
  },
  point_request: {
    key: "point_request",
    route: "/wallet",
    label: "How to request points",
    steps: [
      {
        target: "request-points",
        title: "Request points",
        body: "Top up your balance from your Wallet. Send funds to the PointBank account, attach proof, and submit.",
      },
    ],
  },
  payout: {
    key: "payout",
    route: "/payout",
    label: "How to request a payout",
    steps: [
      {
        target: "request-payout",
        title: "Request a payout",
        body: "Cash out your winnings here. An admin will review and process it.",
      },
    ],
  },
};

export const FULL_TOUR_ORDER = ["essentials"] as const;
