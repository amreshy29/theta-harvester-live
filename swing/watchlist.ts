// swing/watchlist.ts
// Base universe of ~200 NSE-listed stocks covering all major Nifty 500 sectors.
// At scan time the scanner fetches live quotes for all of these, ranks them by
// today's rupee volume (price × volume), and picks the top 50 for 12-stage analysis.

export interface WatchlistStock {
  symbol: string;
  name: string;
  sector: string;
}

export const SWING_WATCHLIST: WatchlistStock[] = [
  // ── Large-cap Financials / Banks ───────────────────────────────────────────
  { symbol: 'NSE:HDFCBANK-EQ',    name: 'HDFC Bank',                   sector: 'Financials' },
  { symbol: 'NSE:ICICIBANK-EQ',   name: 'ICICI Bank',                  sector: 'Financials' },
  { symbol: 'NSE:SBIN-EQ',        name: 'State Bank of India',         sector: 'Financials' },
  { symbol: 'NSE:AXISBANK-EQ',    name: 'Axis Bank',                   sector: 'Financials' },
  { symbol: 'NSE:KOTAKBANK-EQ',   name: 'Kotak Mahindra Bank',         sector: 'Financials' },
  { symbol: 'NSE:BAJFINANCE-EQ',  name: 'Bajaj Finance',               sector: 'Financials' },
  { symbol: 'NSE:BAJAJFINSV-EQ',  name: 'Bajaj Finserv',               sector: 'Financials' },
  { symbol: 'NSE:PFC-EQ',         name: 'Power Finance Corp',          sector: 'Financials' },
  { symbol: 'NSE:RECLTD-EQ',      name: 'REC Limited',                 sector: 'Financials' },
  { symbol: 'NSE:CANBK-EQ',       name: 'Canara Bank',                 sector: 'Financials' },
  { symbol: 'NSE:BANKBARODA-EQ',  name: 'Bank of Baroda',              sector: 'Financials' },
  { symbol: 'NSE:INDUSINDBK-EQ',  name: 'IndusInd Bank',               sector: 'Financials' },
  { symbol: 'NSE:IDFCFIRSTB-EQ',  name: 'IDFC First Bank',             sector: 'Financials' },
  { symbol: 'NSE:FEDERALBNK-EQ',  name: 'Federal Bank',                sector: 'Financials' },
  { symbol: 'NSE:BANDHANBNK-EQ',  name: 'Bandhan Bank',                sector: 'Financials' },
  { symbol: 'NSE:UNIONBANK-EQ',   name: 'Union Bank of India',         sector: 'Financials' },
  { symbol: 'NSE:PNBHOUSING-EQ',  name: 'PNB Housing Finance',         sector: 'Financials' },
  { symbol: 'NSE:CHOLAFIN-EQ',    name: 'Cholamandalam Investment',    sector: 'Financials' },
  { symbol: 'NSE:MUTHOOTFIN-EQ',  name: 'Muthoot Finance',             sector: 'Financials' },
  { symbol: 'NSE:LICHSGFIN-EQ',   name: 'LIC Housing Finance',         sector: 'Financials' },
  { symbol: 'NSE:M&MFIN-EQ',      name: 'Mahindra & Mahindra Fin',    sector: 'Financials' },
  { symbol: 'NSE:MANAPPURAM-EQ',  name: 'Manappuram Finance',          sector: 'Financials' },
  { symbol: 'NSE:HDFCLIFE-EQ',    name: 'HDFC Life Insurance',         sector: 'Financials' },
  { symbol: 'NSE:SBILIFE-EQ',     name: 'SBI Life Insurance',          sector: 'Financials' },
  { symbol: 'NSE:ICICIPRULI-EQ',  name: 'ICICI Prudential Life',       sector: 'Financials' },

  // ── IT / Technology ────────────────────────────────────────────────────────
  { symbol: 'NSE:TCS-EQ',         name: 'Tata Consultancy Services',   sector: 'IT' },
  { symbol: 'NSE:INFY-EQ',        name: 'Infosys',                     sector: 'IT' },
  { symbol: 'NSE:WIPRO-EQ',       name: 'Wipro',                       sector: 'IT' },
  { symbol: 'NSE:HCLTECH-EQ',     name: 'HCL Technologies',            sector: 'IT' },
  { symbol: 'NSE:TECHM-EQ',       name: 'Tech Mahindra',               sector: 'IT' },
  { symbol: 'NSE:LTIM-EQ',        name: 'LTIMindtree',                 sector: 'IT' },
  { symbol: 'NSE:MPHASIS-EQ',     name: 'Mphasis',                     sector: 'IT' },
  { symbol: 'NSE:COFORGE-EQ',     name: 'Coforge',                     sector: 'IT' },
  { symbol: 'NSE:PERSISTENT-EQ',  name: 'Persistent Systems',          sector: 'IT' },
  { symbol: 'NSE:KPITTECH-EQ',    name: 'KPIT Technologies',           sector: 'IT' },
  { symbol: 'NSE:OFSS-EQ',        name: 'Oracle Financial Services',   sector: 'IT' },
  { symbol: 'NSE:CYIENT-EQ',      name: 'Cyient',                      sector: 'IT' },

  // ── Energy ─────────────────────────────────────────────────────────────────
  { symbol: 'NSE:RELIANCE-EQ',    name: 'Reliance Industries',         sector: 'Energy' },
  { symbol: 'NSE:ONGC-EQ',        name: 'Oil & Natural Gas Corp',      sector: 'Energy' },
  { symbol: 'NSE:COALINDIA-EQ',   name: 'Coal India',                  sector: 'Energy' },
  { symbol: 'NSE:BPCL-EQ',        name: 'Bharat Petroleum',            sector: 'Energy' },
  { symbol: 'NSE:IOC-EQ',         name: 'Indian Oil Corp',             sector: 'Energy' },
  { symbol: 'NSE:HINDPETRO-EQ',   name: 'Hindustan Petroleum',         sector: 'Energy' },
  { symbol: 'NSE:GAIL-EQ',        name: 'GAIL India',                  sector: 'Energy' },
  { symbol: 'NSE:OIL-EQ',         name: 'Oil India',                   sector: 'Energy' },
  { symbol: 'NSE:PETRONET-EQ',    name: 'Petronet LNG',                sector: 'Energy' },

  // ── Utilities / Power ──────────────────────────────────────────────────────
  { symbol: 'NSE:POWERGRID-EQ',   name: 'Power Grid Corp',             sector: 'Utilities' },
  { symbol: 'NSE:NTPC-EQ',        name: 'NTPC',                        sector: 'Utilities' },
  { symbol: 'NSE:TATAPOWER-EQ',   name: 'Tata Power',                  sector: 'Utilities' },
  { symbol: 'NSE:ADANIGREEN-EQ',  name: 'Adani Green Energy',          sector: 'Utilities' },
  { symbol: 'NSE:TORNTPOWER-EQ',  name: 'Torrent Power',               sector: 'Utilities' },
  { symbol: 'NSE:JSWENERGY-EQ',   name: 'JSW Energy',                  sector: 'Utilities' },
  { symbol: 'NSE:IREDA-EQ',       name: 'IREDA',                       sector: 'Utilities' },
  { symbol: 'NSE:IGL-EQ',         name: 'Indraprastha Gas',            sector: 'Utilities' },
  { symbol: 'NSE:MGL-EQ',         name: 'Mahanagar Gas',               sector: 'Utilities' },

  // ── Auto & Auto Ancillaries ────────────────────────────────────────────────
  { symbol: 'NSE:M&M-EQ',         name: 'Mahindra & Mahindra',         sector: 'Auto' },
  { symbol: 'NSE:TATAMOTORS-EQ',  name: 'Tata Motors',                 sector: 'Auto' },
  { symbol: 'NSE:MARUTI-EQ',      name: 'Maruti Suzuki India',         sector: 'Auto' },
  { symbol: 'NSE:TVSMOTOR-EQ',    name: 'TVS Motor Company',           sector: 'Auto' },
  { symbol: 'NSE:EICHERMOT-EQ',   name: 'Eicher Motors',               sector: 'Auto' },
  { symbol: 'NSE:HEROMOTOCO-EQ',  name: 'Hero MotoCorp',               sector: 'Auto' },
  { symbol: 'NSE:ASHOKLEY-EQ',    name: 'Ashok Leyland',               sector: 'Auto' },
  { symbol: 'NSE:BALKRISIND-EQ',  name: 'Balkrishna Industries',       sector: 'Auto' },
  { symbol: 'NSE:MRF-EQ',         name: 'MRF',                         sector: 'Auto' },
  { symbol: 'NSE:MOTHERSON-EQ',   name: 'Samvardhana Motherson',       sector: 'Auto' },
  { symbol: 'NSE:BOSCHLTD-EQ',    name: 'Bosch',                       sector: 'Auto' },
  { symbol: 'NSE:SUNDRMFAST-EQ',  name: 'Sundram Fasteners',           sector: 'Auto' },
  { symbol: 'NSE:ENDURANCE-EQ',   name: 'Endurance Technologies',      sector: 'Auto' },

  // ── Metals & Mining ────────────────────────────────────────────────────────
  { symbol: 'NSE:TATASTEEL-EQ',   name: 'Tata Steel',                  sector: 'Metals' },
  { symbol: 'NSE:JSWSTEEL-EQ',    name: 'JSW Steel',                   sector: 'Metals' },
  { symbol: 'NSE:HINDALCO-EQ',    name: 'Hindalco Industries',         sector: 'Metals' },
  { symbol: 'NSE:BHARATFORG-EQ',  name: 'Bharat Forge',                sector: 'Metals' },
  { symbol: 'NSE:NMDC-EQ',        name: 'NMDC',                        sector: 'Metals' },
  { symbol: 'NSE:VEDL-EQ',        name: 'Vedanta',                     sector: 'Metals' },
  { symbol: 'NSE:HINDCOPPER-EQ',  name: 'Hindustan Copper',            sector: 'Metals' },
  { symbol: 'NSE:NATIONALUM-EQ',  name: 'National Aluminium',          sector: 'Metals' },
  { symbol: 'NSE:SAIL-EQ',        name: 'Steel Authority of India',    sector: 'Metals' },
  { symbol: 'NSE:APLAPOLLO-EQ',   name: 'APL Apollo Tubes',            sector: 'Metals' },
  { symbol: 'NSE:MOIL-EQ',        name: 'MOIL',                        sector: 'Metals' },

  // ── Capital Goods / Infrastructure / Defense ───────────────────────────────
  { symbol: 'NSE:LT-EQ',          name: 'Larsen & Toubro',             sector: 'Capital Goods' },
  { symbol: 'NSE:POLYCAB-EQ',     name: 'Polycab India',               sector: 'Capital Goods' },
  { symbol: 'NSE:SIEMENS-EQ',     name: 'Siemens',                     sector: 'Capital Goods' },
  { symbol: 'NSE:ABB-EQ',         name: 'ABB India',                   sector: 'Capital Goods' },
  { symbol: 'NSE:CUMMINSIND-EQ',  name: 'Cummins India',               sector: 'Capital Goods' },
  { symbol: 'NSE:THERMAX-EQ',     name: 'Thermax',                     sector: 'Capital Goods' },
  { symbol: 'NSE:BHEL-EQ',        name: 'Bharat Heavy Electricals',    sector: 'Capital Goods' },
  { symbol: 'NSE:KEC-EQ',         name: 'KEC International',           sector: 'Capital Goods' },
  { symbol: 'NSE:GRINDWELL-EQ',   name: 'Grindwell Norton',            sector: 'Capital Goods' },
  { symbol: 'NSE:HAL-EQ',         name: 'Hindustan Aeronautics',       sector: 'Defense' },
  { symbol: 'NSE:BEL-EQ',         name: 'Bharat Electronics',          sector: 'Defense' },
  { symbol: 'NSE:IRCON-EQ',       name: 'IRCON International',         sector: 'Infrastructure' },
  { symbol: 'NSE:RVNL-EQ',        name: 'Rail Vikas Nigam',            sector: 'Infrastructure' },
  { symbol: 'NSE:IRFC-EQ',        name: 'Indian Railway Finance Corp', sector: 'Infrastructure' },
  { symbol: 'NSE:ADANIPORTS-EQ',  name: 'Adani Ports & SEZ',           sector: 'Infrastructure' },
  { symbol: 'NSE:CONCOR-EQ',      name: 'Container Corp of India',     sector: 'Infrastructure' },
  { symbol: 'NSE:NCC-EQ',         name: 'NCC',                         sector: 'Infrastructure' },

  // ── Telecom ────────────────────────────────────────────────────────────────
  { symbol: 'NSE:BHARTIARTL-EQ',  name: 'Bharti Airtel',               sector: 'Telecom' },

  // ── Pharma / Healthcare ────────────────────────────────────────────────────
  { symbol: 'NSE:SUNPHARMA-EQ',   name: 'Sun Pharmaceutical',          sector: 'Pharma' },
  { symbol: 'NSE:CIPLA-EQ',       name: 'Cipla',                       sector: 'Pharma' },
  { symbol: 'NSE:DIVISLAB-EQ',    name: 'Divis Laboratories',          sector: 'Pharma' },
  { symbol: 'NSE:DRREDDY-EQ',     name: 'Dr Reddys Laboratories',      sector: 'Pharma' },
  { symbol: 'NSE:LUPIN-EQ',       name: 'Lupin',                       sector: 'Pharma' },
  { symbol: 'NSE:AUROPHARMA-EQ',  name: 'Aurobindo Pharma',            sector: 'Pharma' },
  { symbol: 'NSE:IPCALAB-EQ',     name: 'Ipca Laboratories',           sector: 'Pharma' },
  { symbol: 'NSE:BIOCON-EQ',      name: 'Biocon',                      sector: 'Pharma' },
  { symbol: 'NSE:APOLLOHOSP-EQ',  name: 'Apollo Hospitals',            sector: 'Healthcare' },
  { symbol: 'NSE:MAXHEALTHCARE-EQ', name: 'Max Healthcare',            sector: 'Healthcare' },
  { symbol: 'NSE:FORTIS-EQ',      name: 'Fortis Healthcare',           sector: 'Healthcare' },
  { symbol: 'NSE:LALPATHLAB-EQ',  name: 'Dr Lal PathLabs',             sector: 'Healthcare' },
  { symbol: 'NSE:METROPOLIS-EQ',  name: 'Metropolis Healthcare',       sector: 'Healthcare' },

  // ── FMCG / Consumer ───────────────────────────────────────────────────────
  { symbol: 'NSE:ITC-EQ',         name: 'ITC',                         sector: 'FMCG' },
  { symbol: 'NSE:HINDUNILVR-EQ',  name: 'Hindustan Unilever',          sector: 'FMCG' },
  { symbol: 'NSE:DABUR-EQ',       name: 'Dabur India',                 sector: 'FMCG' },
  { symbol: 'NSE:BRITANNIA-EQ',   name: 'Britannia Industries',        sector: 'FMCG' },
  { symbol: 'NSE:NESTLEIND-EQ',   name: 'Nestle India',                sector: 'FMCG' },
  { symbol: 'NSE:COLPAL-EQ',      name: 'Colgate Palmolive India',     sector: 'FMCG' },
  { symbol: 'NSE:MARICO-EQ',      name: 'Marico',                      sector: 'FMCG' },
  { symbol: 'NSE:EMAMILTD-EQ',    name: 'Emami',                       sector: 'FMCG' },
  { symbol: 'NSE:JYOTHYLAB-EQ',   name: 'Jyothy Labs',                 sector: 'FMCG' },
  { symbol: 'NSE:RADICO-EQ',      name: 'Radico Khaitan',              sector: 'FMCG' },
  { symbol: 'NSE:TRENT-EQ',       name: 'Trent',                       sector: 'Retail' },
  { symbol: 'NSE:TITAN-EQ',       name: 'Titan Company',               sector: 'Consumer Goods' },
  { symbol: 'NSE:JUBLFOOD-EQ',    name: 'Jubilant FoodWorks',          sector: 'Retail' },
  { symbol: 'NSE:DEVYANI-EQ',     name: 'Devyani International',       sector: 'Retail' },
  { symbol: 'NSE:WESTLIFE-EQ',    name: 'Westlife Foodworld',          sector: 'Retail' },

  // ── Consumer Durables ──────────────────────────────────────────────────────
  { symbol: 'NSE:DIXON-EQ',       name: 'Dixon Technologies',          sector: 'Consumer Durables' },
  { symbol: 'NSE:HAVELLS-EQ',     name: 'Havells India',               sector: 'Consumer Durables' },
  { symbol: 'NSE:VOLTAS-EQ',      name: 'Voltas',                      sector: 'Consumer Durables' },

  // ── Real Estate ────────────────────────────────────────────────────────────
  { symbol: 'NSE:DLF-EQ',         name: 'DLF',                         sector: 'Real Estate' },
  { symbol: 'NSE:GODREJPROP-EQ',  name: 'Godrej Properties',           sector: 'Real Estate' },
  { symbol: 'NSE:OBEROIRLTY-EQ',  name: 'Oberoi Realty',               sector: 'Real Estate' },
  { symbol: 'NSE:PRESTIGE-EQ',    name: 'Prestige Estates',            sector: 'Real Estate' },
  { symbol: 'NSE:PHOENIXLTD-EQ',  name: 'Phoenix Mills',               sector: 'Real Estate' },
  { symbol: 'NSE:BRIGADE-EQ',     name: 'Brigade Enterprises',         sector: 'Real Estate' },
  { symbol: 'NSE:SOBHA-EQ',       name: 'Sobha',                       sector: 'Real Estate' },
  { symbol: 'NSE:MACROTECH-EQ',   name: 'Lodha (Macrotech)',           sector: 'Real Estate' },

  // ── Chemicals ─────────────────────────────────────────────────────────────
  { symbol: 'NSE:PIDILITIND-EQ',  name: 'Pidilite Industries',         sector: 'Chemicals' },
  { symbol: 'NSE:TATACHEM-EQ',    name: 'Tata Chemicals',              sector: 'Chemicals' },
  { symbol: 'NSE:AARTI-EQ',       name: 'Aarti Industries',            sector: 'Chemicals' },
  { symbol: 'NSE:VINATIORGA-EQ',  name: 'Vinati Organics',             sector: 'Chemicals' },
  { symbol: 'NSE:DEEPAKFERT-EQ',  name: 'Deepak Fertilisers',         sector: 'Chemicals' },
  { symbol: 'NSE:NAVINFLUOR-EQ',  name: 'Navin Fluorine',              sector: 'Chemicals' },
  { symbol: 'NSE:ATUL-EQ',        name: 'Atul',                        sector: 'Chemicals' },
  { symbol: 'NSE:FINEORG-EQ',     name: 'Fine Organic Industries',     sector: 'Chemicals' },

  // ── Cement ────────────────────────────────────────────────────────────────
  { symbol: 'NSE:ULTRACEMCO-EQ',  name: 'UltraTech Cement',            sector: 'Cement' },
  { symbol: 'NSE:GRASIM-EQ',      name: 'Grasim Industries',           sector: 'Cement' },
  { symbol: 'NSE:AMBUJACEM-EQ',   name: 'Ambuja Cements',              sector: 'Cement' },
  { symbol: 'NSE:ACC-EQ',         name: 'ACC',                         sector: 'Cement' },
  { symbol: 'NSE:SHREECEM-EQ',    name: 'Shree Cement',                sector: 'Cement' },

  // ── Conglomerates ─────────────────────────────────────────────────────────
  { symbol: 'NSE:ADANIENT-EQ',    name: 'Adani Enterprises',           sector: 'Conglomerates' },

  // ── New Age / Platform ─────────────────────────────────────────────────────
  { symbol: 'NSE:ZOMATO-EQ',      name: 'Zomato',                      sector: 'Platform' },
  { symbol: 'NSE:NYKAA-EQ',       name: 'FSN E-Commerce (Nykaa)',      sector: 'Platform' },
  { symbol: 'NSE:POLICYBZR-EQ',   name: 'PB Fintech (PolicyBazaar)',   sector: 'Platform' },
  { symbol: 'NSE:DELHIVERY-EQ',   name: 'Delhivery',                   sector: 'Platform' },
  { symbol: 'NSE:PAYTM-EQ',       name: 'One97 Communications',        sector: 'Platform' },
  { symbol: 'NSE:INDIAMART-EQ',   name: 'IndiaMART InterMESH',         sector: 'Platform' },

  // ── Textiles ──────────────────────────────────────────────────────────────
  { symbol: 'NSE:PAGEIND-EQ',     name: 'Page Industries',             sector: 'Textiles' },
  { symbol: 'NSE:KPRMILL-EQ',     name: 'KPR Mill',                    sector: 'Textiles' },
  { symbol: 'NSE:WELSPUNIND-EQ',  name: 'Welspun India',               sector: 'Textiles' },

  // ── Paints & Coatings ─────────────────────────────────────────────────────
  { symbol: 'NSE:ASIANPAINT-EQ',  name: 'Asian Paints',                sector: 'Consumer Goods' },
  { symbol: 'NSE:BERGEPAINT-EQ',  name: 'Berger Paints',               sector: 'Consumer Goods' },
  { symbol: 'NSE:KANSAINER-EQ',   name: 'Kansai Nerolac',              sector: 'Consumer Goods' },
];
