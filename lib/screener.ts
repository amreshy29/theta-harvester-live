// lib/screener.ts
// Breakout radar screener — finds NSE stocks forming bases 20-50% below
// their 52-week high with unusual volume signalling a potential breakout.

export interface ScreenerStock {
  symbol:             string;
  name:               string;
  sector:             string;
  ltp:                number;
  change:             number;
  changePct:          number;
  weekHigh52:         number;
  weekLow52:          number;
  pctFromHigh:        number;   // % below 52-week high
  todayVolume:        number;
  avgVolume20d:       number;
  volumeRatio:        number;   // today / 20d avg (surge indicator)
  consolidationRange: number;   // % price range over last 20 days (lower = tighter base)
  breakoutLine:       number;   // 20-day high — the level to watch
  isBreakingOut:      boolean;  // ltp > breakoutLine today
  trend5d:            number;   // 5-day price change %
  baseLength:         number;   // consecutive days price stayed within ±12% of ltp
  score:              number;   // composite breakout score 0-100
}

// Curated NSE large/mid-cap equity universe for screening (~55 stocks)
export const SCREENER_UNIVERSE: { symbol: string; name: string; sector: string }[] = [
  // Banking & Finance
  { symbol: 'NSE:HDFCBANK-EQ',   name: 'HDFC Bank',           sector: 'Banking'   },
  { symbol: 'NSE:ICICIBANK-EQ',  name: 'ICICI Bank',           sector: 'Banking'   },
  { symbol: 'NSE:AXISBANK-EQ',   name: 'Axis Bank',            sector: 'Banking'   },
  { symbol: 'NSE:KOTAKBANK-EQ',  name: 'Kotak Mahindra',       sector: 'Banking'   },
  { symbol: 'NSE:SBIN-EQ',       name: 'State Bank of India',  sector: 'Banking'   },
  { symbol: 'NSE:INDUSINDBK-EQ', name: 'IndusInd Bank',        sector: 'Banking'   },
  { symbol: 'NSE:BAJFINANCE-EQ', name: 'Bajaj Finance',        sector: 'Finance'   },
  { symbol: 'NSE:BAJAJFINSV-EQ', name: 'Bajaj Finserv',        sector: 'Finance'   },
  { symbol: 'NSE:MUTHOOTFIN-EQ', name: 'Muthoot Finance',      sector: 'Finance'   },
  // IT
  { symbol: 'NSE:TCS-EQ',        name: 'TCS',                  sector: 'IT'        },
  { symbol: 'NSE:INFY-EQ',       name: 'Infosys',              sector: 'IT'        },
  { symbol: 'NSE:HCLTECH-EQ',    name: 'HCL Technologies',     sector: 'IT'        },
  { symbol: 'NSE:WIPRO-EQ',      name: 'Wipro',                sector: 'IT'        },
  { symbol: 'NSE:TECHM-EQ',      name: 'Tech Mahindra',        sector: 'IT'        },
  { symbol: 'NSE:PERSISTENT-EQ', name: 'Persistent Systems',   sector: 'IT'        },
  { symbol: 'NSE:COFORGE-EQ',    name: 'Coforge',              sector: 'IT'        },
  { symbol: 'NSE:MPHASIS-EQ',    name: 'Mphasis',              sector: 'IT'        },
  // FMCG / Consumer
  { symbol: 'NSE:HINDUNILVR-EQ', name: 'Hindustan Unilever',   sector: 'FMCG'     },
  { symbol: 'NSE:ITC-EQ',        name: 'ITC',                  sector: 'FMCG'     },
  { symbol: 'NSE:NESTLEIND-EQ',  name: 'Nestle India',         sector: 'FMCG'     },
  { symbol: 'NSE:BRITANNIA-EQ',  name: 'Britannia',            sector: 'FMCG'     },
  { symbol: 'NSE:DABUR-EQ',      name: 'Dabur India',          sector: 'FMCG'     },
  { symbol: 'NSE:MARICO-EQ',     name: 'Marico',               sector: 'FMCG'     },
  { symbol: 'NSE:COLPAL-EQ',     name: 'Colgate Palmolive',    sector: 'FMCG'     },
  { symbol: 'NSE:TATACONSUM-EQ', name: 'Tata Consumer',        sector: 'FMCG'     },
  // Auto
  { symbol: 'NSE:MARUTI-EQ',     name: 'Maruti Suzuki',        sector: 'Auto'      },
  { symbol: 'NSE:TATAMOTORS-EQ', name: 'Tata Motors',          sector: 'Auto'      },
  { symbol: 'NSE:HEROMOTOCO-EQ', name: 'Hero MotoCorp',        sector: 'Auto'      },
  { symbol: 'NSE:EICHERMOT-EQ',  name: 'Eicher Motors',        sector: 'Auto'      },
  // Pharma / Healthcare
  { symbol: 'NSE:SUNPHARMA-EQ',  name: 'Sun Pharma',           sector: 'Pharma'    },
  { symbol: 'NSE:DIVISLAB-EQ',   name: "Divi's Labs",          sector: 'Pharma'    },
  { symbol: 'NSE:DRREDDY-EQ',    name: "Dr. Reddy's",          sector: 'Pharma'    },
  { symbol: 'NSE:CIPLA-EQ',      name: 'Cipla',                sector: 'Pharma'    },
  { symbol: 'NSE:APOLLOHOSP-EQ', name: 'Apollo Hospitals',     sector: 'Healthcare'},
  // Energy & Infra
  { symbol: 'NSE:RELIANCE-EQ',   name: 'Reliance Industries',  sector: 'Energy'    },
  { symbol: 'NSE:ONGC-EQ',       name: 'ONGC',                 sector: 'Energy'    },
  { symbol: 'NSE:NTPC-EQ',       name: 'NTPC',                 sector: 'Energy'    },
  { symbol: 'NSE:POWERGRID-EQ',  name: 'Power Grid',           sector: 'Energy'    },
  { symbol: 'NSE:TATAPOWER-EQ',  name: 'Tata Power',           sector: 'Energy'    },
  { symbol: 'NSE:ADANIPORTS-EQ', name: 'Adani Ports',          sector: 'Infra'     },
  { symbol: 'NSE:LT-EQ',         name: 'Larsen & Toubro',      sector: 'Infra'     },
  { symbol: 'NSE:GAIL-EQ',       name: 'GAIL India',           sector: 'Energy'    },
  // Metals
  { symbol: 'NSE:JSWSTEEL-EQ',   name: 'JSW Steel',            sector: 'Metals'    },
  { symbol: 'NSE:TATASTEEL-EQ',  name: 'Tata Steel',           sector: 'Metals'    },
  { symbol: 'NSE:HINDALCO-EQ',   name: 'Hindalco',             sector: 'Metals'    },
  { symbol: 'NSE:VEDL-EQ',       name: 'Vedanta',              sector: 'Metals'    },
  { symbol: 'NSE:COALINDIA-EQ',  name: 'Coal India',           sector: 'Metals'    },
  // Consumer Durables & Discretionary
  { symbol: 'NSE:TITAN-EQ',      name: 'Titan Company',        sector: 'Consumer'  },
  { symbol: 'NSE:HAVELLS-EQ',    name: 'Havells India',        sector: 'Consumer'  },
  { symbol: 'NSE:ASIANPAINT-EQ', name: 'Asian Paints',         sector: 'Consumer'  },
  { symbol: 'NSE:PIDILITIND-EQ', name: 'Pidilite Industries',  sector: 'Consumer'  },
  { symbol: 'NSE:ULTRACEMCO-EQ', name: 'UltraTech Cement',     sector: 'Cement'    },
  { symbol: 'NSE:GRASIM-EQ',     name: 'Grasim Industries',    sector: 'Cement'    },
  { symbol: 'NSE:DMART-EQ',      name: 'Avenue Supermarts',    sector: 'Retail'    },
  { symbol: 'NSE:TRENT-EQ',      name: 'Trent',                sector: 'Retail'    },
  { symbol: 'NSE:IRCTC-EQ',      name: 'IRCTC',                sector: 'Railways'  },
  { symbol: 'NSE:ZOMATO-EQ',     name: 'Zomato',               sector: 'Tech'      },
];

// Sector colour palette for badges
export const SECTOR_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  Banking:    { color: '#60a5fa', bg: 'rgba(96,165,250,.1)',   border: 'rgba(96,165,250,.25)'   },
  Finance:    { color: '#60a5fa', bg: 'rgba(96,165,250,.1)',   border: 'rgba(96,165,250,.25)'   },
  IT:         { color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: 'rgba(167,139,250,.25)'  },
  FMCG:       { color: '#fbbf24', bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.25)'   },
  Auto:       { color: '#34d399', bg: 'rgba(52,211,153,.1)',  border: 'rgba(52,211,153,.25)'   },
  Pharma:     { color: '#f472b6', bg: 'rgba(244,114,182,.1)', border: 'rgba(244,114,182,.25)'  },
  Healthcare: { color: '#f472b6', bg: 'rgba(244,114,182,.1)', border: 'rgba(244,114,182,.25)'  },
  Energy:     { color: '#fb923c', bg: 'rgba(251,146,60,.1)',  border: 'rgba(251,146,60,.25)'   },
  Infra:      { color: '#e8b86d', bg: 'rgba(232,184,109,.1)', border: 'rgba(232,184,109,.25)'  },
  Metals:     { color: '#94a3b8', bg: 'rgba(148,163,184,.1)', border: 'rgba(148,163,184,.25)'  },
  Consumer:   { color: '#4ade80', bg: 'rgba(74,222,128,.1)',  border: 'rgba(74,222,128,.25)'   },
  Cement:     { color: '#94a3b8', bg: 'rgba(148,163,184,.1)', border: 'rgba(148,163,184,.25)'  },
  Retail:     { color: '#4ade80', bg: 'rgba(74,222,128,.1)',  border: 'rgba(74,222,128,.25)'   },
  Railways:   { color: '#e8b86d', bg: 'rgba(232,184,109,.1)', border: 'rgba(232,184,109,.25)'  },
  Tech:       { color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: 'rgba(167,139,250,.25)'  },
};

// Deterministic demo data shown when Fyers is not connected
export function generateMockScreenerData(): ScreenerStock[] {
  const mockStocks: ScreenerStock[] = [
    {
      symbol: 'NSE:WIPRO-EQ', name: 'Wipro', sector: 'IT',
      ltp: 386.40, change: 4.20, changePct: 1.10,
      weekHigh52: 580.00, weekLow52: 340.00,
      pctFromHigh: 33.4, todayVolume: 18_400_000, avgVolume20d: 7_200_000, volumeRatio: 2.56,
      consolidationRange: 7.2, breakoutLine: 392.00, isBreakingOut: false,
      trend5d: 2.1, baseLength: 38, score: 81,
    },
    {
      symbol: 'NSE:TATASTEEL-EQ', name: 'Tata Steel', sector: 'Metals',
      ltp: 148.55, change: 2.85, changePct: 1.96,
      weekHigh52: 235.00, weekLow52: 131.00,
      pctFromHigh: 36.8, todayVolume: 94_000_000, avgVolume20d: 38_500_000, volumeRatio: 2.44,
      consolidationRange: 9.1, breakoutLine: 153.00, isBreakingOut: false,
      trend5d: 3.4, baseLength: 45, score: 76,
    },
    {
      symbol: 'NSE:INDUSINDBK-EQ', name: 'IndusInd Bank', sector: 'Banking',
      ltp: 692.30, change: 11.50, changePct: 1.69,
      weekHigh52: 1140.00, weekLow52: 620.00,
      pctFromHigh: 39.3, todayVolume: 11_200_000, avgVolume20d: 5_100_000, volumeRatio: 2.20,
      consolidationRange: 6.8, breakoutLine: 710.00, isBreakingOut: false,
      trend5d: 1.8, baseLength: 52, score: 73,
    },
    {
      symbol: 'NSE:TECHM-EQ', name: 'Tech Mahindra', sector: 'IT',
      ltp: 1345.00, change: 28.00, changePct: 2.12,
      weekHigh52: 1740.00, weekLow52: 1175.00,
      pctFromHigh: 22.7, todayVolume: 8_900_000, avgVolume20d: 4_400_000, volumeRatio: 2.02,
      consolidationRange: 11.4, breakoutLine: 1388.00, isBreakingOut: false,
      trend5d: 4.2, baseLength: 28, score: 68,
    },
    {
      symbol: 'NSE:ONGC-EQ', name: 'ONGC', sector: 'Energy',
      ltp: 218.60, change: 3.10, changePct: 1.44,
      weekHigh52: 345.00, weekLow52: 195.00,
      pctFromHigh: 36.6, todayVolume: 42_000_000, avgVolume20d: 19_500_000, volumeRatio: 2.15,
      consolidationRange: 8.4, breakoutLine: 226.00, isBreakingOut: false,
      trend5d: 1.3, baseLength: 61, score: 65,
    },
    {
      symbol: 'NSE:AXISBANK-EQ', name: 'Axis Bank', sector: 'Banking',
      ltp: 988.50, change: 14.20, changePct: 1.46,
      weekHigh52: 1339.00, weekLow52: 890.00,
      pctFromHigh: 26.2, todayVolume: 16_700_000, avgVolume20d: 8_500_000, volumeRatio: 1.96,
      consolidationRange: 12.1, breakoutLine: 1010.00, isBreakingOut: false,
      trend5d: 2.9, baseLength: 33, score: 61,
    },
    {
      symbol: 'NSE:HCLTECH-EQ', name: 'HCL Technologies', sector: 'IT',
      ltp: 1428.00, change: -8.50, changePct: -0.59,
      weekHigh52: 1900.00, weekLow52: 1270.00,
      pctFromHigh: 24.8, todayVolume: 9_100_000, avgVolume20d: 4_900_000, volumeRatio: 1.86,
      consolidationRange: 10.7, breakoutLine: 1480.00, isBreakingOut: false,
      trend5d: 0.4, baseLength: 24, score: 54,
    },
    {
      symbol: 'NSE:GRASIM-EQ', name: 'Grasim Industries', sector: 'Cement',
      ltp: 2289.00, change: 32.00, changePct: 1.42,
      weekHigh52: 3400.00, weekLow52: 2050.00,
      pctFromHigh: 32.7, todayVolume: 3_200_000, avgVolume20d: 1_700_000, volumeRatio: 1.88,
      consolidationRange: 13.2, breakoutLine: 2350.00, isBreakingOut: false,
      trend5d: 1.6, baseLength: 41, score: 52,
    },
  ];
  return mockStocks;
}
