export type TourStep = {
  target: string; // data-tour value or 'body'
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
};

export type TourDef = {
  key: string;
  route: string; // route the tour belongs to
  label: string;
  steps: TourStep[];
};

export const TOURS: Record<string, TourDef> = {
  dashboard: {
    key: "dashboard",
    route: "/dashboard",
    label: "Dashboard",
    steps: [
      {
        target: "wallet-balance",
        title: "Your wallet balance",
        body: "This is your available points balance, shown in the top bar everywhere on the platform.",
      },
      {
        target: "quick-actions",
        title: "Quick actions",
        body: "Jump straight to the most common pages — bets, picks, payouts, and more.",
      },
      {
        target: "help-link",
        title: "Help is always one tap away",
        body: "Tap the help icon any time to revisit this tour, browse guides, or read the FAQ.",
      },
    ],
  },
  wallet: {
    key: "wallet",
    route: "/wallet",
    label: "Wallet",
    steps: [
      { target: "wallet-balance", title: "Current balance", body: "Your available betting points." },
      {
        target: "request-points",
        title: "Request points",
        body: "Top up your account by requesting points. An admin reviews each request.",
      },
      {
        target: "transaction-history",
        title: "Transaction history",
        body: "Every credit, debit, payout, and adjustment appears here for full transparency.",
      },
    ],
  },
  point_request: {
    key: "point_request",
    route: "/wallet",
    label: "Point Request",
    steps: [
      {
        target: "pointbank-field",
        title: "PointBank details",
        body: "Send funds to this account before requesting points. Copy the details carefully.",
      },
      {
        target: "reference-id",
        title: "Your reference ID",
        body: "Use this unique reference when making payment so we can match it to your account.",
      },
      {
        target: "proof-upload",
        title: "Upload your proof",
        body: "Attach a screenshot of your transfer. Required before submitting a request.",
      },
      {
        target: "submit-request",
        title: "Submit",
        body: "Requests are reviewed by support/admin. You'll be notified when approved.",
      },
    ],
  },
  matches: {
    key: "matches",
    route: "/bets",
    label: "Matches",
    steps: [
      { target: "available-matches", title: "Available matches", body: "Browse active matches available for betting." },
      { target: "match-odds", title: "Odds", body: "Odds determine your potential return — higher odds, higher payout." },
      { target: "bet-button", title: "Place a bet", body: "Tap a market to open the bet slip and choose your stake." },
    ],
  },
  betting: {
    key: "betting",
    route: "/bets",
    label: "Betting",
    steps: [
      { target: "stake-input", title: "Your stake", body: "Enter the number of points you want to risk on this bet." },
      { target: "potential-return", title: "Potential return", body: "Automatically calculated from your stake and the odds." },
      { target: "place-bet", title: "Confirm", body: "Once confirmed, your stake is deducted from your wallet immediately." },
    ],
  },
  my_predictions: {
    key: "my_predictions",
    route: "/my-predictions",
    label: "My Predictions",
    steps: [
      { target: "pending-bets", title: "Pending bets", body: "Bets that are still waiting for match results." },
      { target: "settled-bets", title: "Settled bets", body: "Completed bets, showing your wins and losses." },
      { target: "bet-details", title: "Bet details", body: "Open any bet to see odds, stake, payout, and settlement info." },
    ],
  },
  payout: {
    key: "payout",
    route: "/payout",
    label: "Payout",
    steps: [
      { target: "request-payout", title: "Request a payout", body: "Convert your winnings into a withdrawal request." },
      { target: "payout-history", title: "Payout history", body: "Track the status of every withdrawal you've made." },
      { target: "payout-proof", title: "Proof upload", body: "Upload any required verification documents if asked." },
    ],
  },
  support: {
    key: "support",
    route: "/support",
    label: "Support",
    steps: [
      { target: "create-ticket", title: "Create a ticket", body: "Reach out if you experience any issues — we're here to help." },
      { target: "conversation", title: "Conversation", body: "Communicate directly with our support staff in real time." },
      { target: "attachments", title: "Attachments", body: "Upload screenshots and supporting documents to speed things up." },
    ],
  },
  first_bet: {
    key: "first_bet",
    route: "/bets",
    label: "Your first bet",
    steps: [
      { target: "available-matches", title: "1. Select a match", body: "Pick any active match you'd like to bet on." },
      { target: "match-odds", title: "2. Select a market", body: "Choose an outcome — home, draw, away, or a special market." },
      { target: "stake-input", title: "3. Enter a stake", body: "Decide how many points to put on the line." },
      { target: "potential-return", title: "4. Review potential return", body: "See exactly what you'd win before confirming." },
      { target: "place-bet", title: "5. Confirm your bet", body: "Done! Your stake is held until the match settles." },
    ],
  },
  first_point_request: {
    key: "first_point_request",
    route: "/wallet",
    label: "Your first point request",
    steps: [
      { target: "pointbank-field", title: "1. Make payment", body: "Transfer funds to the PointBank account shown above." },
      { target: "reference-id", title: "2. Use your reference", body: "Include your reference ID so we can match the payment." },
      { target: "proof-upload", title: "3. Upload proof", body: "Attach a screenshot of your successful transfer." },
      { target: "submit-request", title: "4. Submit request", body: "Send the request for review." },
      { target: "transaction-history", title: "5. Wait for approval", body: "You'll see the credit appear here once an admin approves it." },
    ],
  },
};

export const FULL_TOUR_ORDER = [
  "dashboard",
  "wallet",
  "matches",
  "my_predictions",
  "payout",
  "support",
] as const;
