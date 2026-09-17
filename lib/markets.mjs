// The 200 markets of the design (ISO 3166 alpha-2), and what a paid random
// draw is in each: a lottery (forbidden without a licence), a regulated
// prize draw (allowed with disclosures) or unregulated. Demo values, set by
// legal in the real thing.
export const MARKETS = "IE GB DE FR NL BE LU ES PT IT AT CH DK SE NO FI IS EE LV LT PL CZ SK HU SI HR RO BG GR CY MT US CA MX BR AR CL CO PE UY PY BO EC VE GT HN SV NI CR PA DO CU JM HT TT BS BB AU NZ JP KR CN TW HK SG MY TH VN PH ID IN PK BD LK NP BT MM KH LA MN KZ UZ KG TJ TM AF IR IQ SA AE QA KW BH OM YE JO LB SY IL PS TR GE AM AZ RU BY UA MD EG LY TN DZ MA SD SS ET ER DJ SO KE UG TZ RW BI CD CG GA CM CF TD NE NG BJ TG GH CI LR SL GN GW SN GM MR ML BF CV ST GQ AO ZM ZW MW MZ MG MU SC KM NA BW ZA LS SZ RE YT FJ PG SB VU NC PF WS TO TV KI NR FM MH PW GL FO GI IM JE GG AD MC SM VA LI XK BA ME MK AL RS AW CW SX BQ BL".split(" ");
if (MARKETS.length !== 200) throw new Error(`${MARKETS.length} markets, expected 200`);
export const MARKET_KIND = (m) => {
  const lottery = new Set("US CN IN TR SA AE QA KW BH OM YE IR IQ AF PK BD LK MM KH LA VN ID MY BN EG LY DZ MA SD SO RU BY KZ UZ TM TJ".split(" "));
  const regulated = new Set("IE GB DE FR NL BE LU ES PT IT AT CH DK SE NO FI IS EE LV LT PL CZ SK HU SI HR RO BG GR CY MT CA AU NZ JP KR SG HK TW ZA BR AR CL CO MX PE UY IL".split(" "));
  return lottery.has(m) ? "lottery" : regulated.has(m) ? "regulated" : "unregulated";
};
// The crowd's home markets in the demo, weighted towards where the platform started.
export const HOME_MARKETS = ["IE", "IE", "IE", "GB", "GB", "DE", "FR", "NL", "ES", "PT", "IT", "SE", "PL", "CA", "AU", "US", "BR", "IN", "JP"];
