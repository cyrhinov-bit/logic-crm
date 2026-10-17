const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'src', 'context', 'AppContext.tsx');
let content = fs.readFileSync(filepath, 'utf8');

// Replace tableData assignments to use mergeData
const replacements = [
  { match: /if \(crmDocumentsData\) \{([\s\S]*?)setCrmDocuments\(parsedCrmDocuments\); await db\.documents\.setItem\('data', parsedCrmDocuments\);\s*\}/, cacheName: 'cachedCrmDocuments', varName: 'parsedCrmDocuments', setter: 'setCrmDocuments', dbStore: 'documents' },
  { match: /if \(clientsData\) \{([\s\S]*?)setClients\(parsedClients\); await db\.clients\.setItem\('data', parsedClients\);\s*\}/, cacheName: 'cachedClients', varName: 'parsedClients', setter: 'setClients', dbStore: 'clients' },
  { match: /if \(servicesData\) \{([\s\S]*?)setServices\(servicesData as Service\[\]\); await db\.services\.setItem\('data', servicesData\);\s*\}/, cacheName: 'cachedServices', varName: '(servicesData as Service[])', setter: 'setServices', dbStore: 'services' },
  { match: /if \(prestationsData\) \{([\s\S]*?)setPrestations\(parsedPrestations\); await db\.prestations\.setItem\('data', parsedPrestations\);\s*\}/, cacheName: 'cachedPrestations', varName: 'parsedPrestations', setter: 'setPrestations', dbStore: 'prestations' },
  // Note: settings uses .single() so it returns an object, not an array. We don't use mergeData for it.
  { match: /if \(quotesData\) \{([\s\S]*?)setQuotes\(parsedQuotes\); await db\.quotes\.setItem\('data', parsedQuotes\);\s*\}/, cacheName: 'cachedQuotes', varName: 'parsedQuotes', setter: 'setQuotes', dbStore: 'quotes' },
  { match: /if \(salesData\) \{([\s\S]*?)setSales\(parsedSales\); await db\.sales\.setItem\('data', parsedSales\);\s*\}/, cacheName: 'cachedSales', varName: 'parsedSales', setter: 'setSales', dbStore: 'sales' },
  { match: /if \(commissionsData\) \{([\s\S]*?)setCommissions\(parsedCommissions\); await db\.commissions\.setItem\('data', parsedCommissions\);\s*\}/, cacheName: 'cachedCommissions', varName: 'parsedCommissions', setter: 'setCommissions', dbStore: 'commissions' },
  { match: /if \(installmentsData\) \{([\s\S]*?)setInstallments\(parsedInstallments\); await db\.installments\.setItem\('data', parsedInstallments\);\s*\}/, cacheName: 'cachedInstallments', varName: 'parsedInstallments', setter: 'setInstallments', dbStore: 'installments' },
  { match: /if \(prospectsData\) \{([\s\S]*?)setProspects\(parsedProspects\); await db\.prospects\.setItem\('data', parsedProspects\);\s*\}/, cacheName: 'cachedProspects', varName: 'parsedProspects', setter: 'setProspects', dbStore: 'prospects' },
  { match: /if \(prospectActivitiesData\) \{([\s\S]*?)setProspectActivities\(parsedActivities\); await db\.prospectActivities\.setItem\('data', parsedActivities\);\s*\}/, cacheName: 'cachedProspectActivities', varName: 'parsedActivities', setter: 'setProspectActivities', dbStore: 'prospectActivities' },
  { match: /if \(prospectFollowUpsData\) \{([\s\S]*?)setProspectFollowUps\(parsedFollowUps\); await db\.prospectFollowUps\.setItem\('data', parsedFollowUps\);\s*\}/, cacheName: 'cachedProspectFollowUps', varName: 'parsedFollowUps', setter: 'setProspectFollowUps', dbStore: 'prospectFollowUps' },
  { match: /if \(categoriesData\) \{([\s\S]*?)setCategories\(parsedCategories\); await db\.categories\.setItem\('data', parsedCategories\);\s*\}/, cacheName: 'cachedCategories', varName: 'parsedCategories', setter: 'setCategories', dbStore: 'categories' },
  { match: /if \(activityReportsData\) \{([\s\S]*?)setActivityReports\(parsedReports\); await db\.activityReports\.setItem\('data', parsedReports\);\s*\}/, cacheName: 'cachedActivityReports', varName: 'parsedReports', setter: 'setActivityReports', dbStore: 'activityReports' },
  { match: /if \(weeklyReportsData\) \{([\s\S]*?)setWeeklyReports\(parsedReports\); await db\.weeklyReports\.setItem\('data', parsedReports\);\s*\}/, cacheName: 'cachedWeeklyReports', varName: 'parsedReports', setter: 'setWeeklyReports', dbStore: 'weeklyReports' },
  { match: /if \(posCategoriesData\) \{([\s\S]*?)setPosCategories\(parsed\); await db\.posCategories\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosCategories', varName: 'parsed', setter: 'setPosCategories', dbStore: 'posCategories' },
  { match: /if \(posBrandsData\) \{([\s\S]*?)setPosBrands\(parsed\); await db\.posBrands\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosBrands', varName: 'parsed', setter: 'setPosBrands', dbStore: 'posBrands' },
  { match: /if \(posSuppliersData\) \{([\s\S]*?)setPosSuppliers\(parsed\); await db\.posSuppliers\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosSuppliers', varName: 'parsed', setter: 'setPosSuppliers', dbStore: 'posSuppliers' },
  { match: /if \(posProductsData\) \{([\s\S]*?)setPosProducts\(parsed\); await db\.posProducts\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosProducts', varName: 'parsed', setter: 'setPosProducts', dbStore: 'posProducts' },
  { match: /if \(posStockEntriesData\) \{([\s\S]*?)setPosStockEntries\(parsed\); await db\.posStockEntries\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosStockEntries', varName: 'parsed', setter: 'setPosStockEntries', dbStore: 'posStockEntries' },
  { match: /if \(posStockMovementsData\) \{([\s\S]*?)setPosStockMovements\(parsed\); await db\.posStockMovements\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosStockMovements', varName: 'parsed', setter: 'setPosStockMovements', dbStore: 'posStockMovements' },
  { match: /if \(posInventoriesData\) \{([\s\S]*?)setPosInventories\(parsed\); await db\.posInventories\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosInventories', varName: 'parsed', setter: 'setPosInventories', dbStore: 'posInventories' },
  { match: /if \(posCashSessionsData\) \{([\s\S]*?)setPosCashSessions\(parsed\); await db\.posCashSessions\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosCashSessions', varName: 'parsed', setter: 'setPosCashSessions', dbStore: 'posCashSessions' },
  { match: /if \(posTransactionsData\) \{([\s\S]*?)setPosTransactions\(parsed\); await db\.posTransactions\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosTransactions', varName: 'parsed', setter: 'setPosTransactions', dbStore: 'posTransactions' },
  { match: /if \(posPaymentsData\) \{([\s\S]*?)setPosPayments\(parsed\); await db\.posPayments\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosPayments', varName: 'parsed', setter: 'setPosPayments', dbStore: 'posPayments' },
  { match: /if \(posDiscountsData\) \{([\s\S]*?)setPosDiscounts\(parsed\); await db\.posDiscounts\.setItem\('data', parsed\);\s*\}/, cacheName: 'cachedPosDiscounts', varName: 'parsed', setter: 'setPosDiscounts', dbStore: 'posDiscounts' },
  // posSettings uses single() too.
];

for (const r of replacements) {
  const dataVar = r.match.source.split(' ')[1].replace('\\)', '').replace('\\(', ''); // extract XData
  content = content.replace(r.match, `if (${dataVar} && ${dataVar}.length > 0) {$1const merged = mergeData(${r.cacheName}, ${r.varName});
          ${r.setter}(merged); await db.${r.dbStore}.setItem('data', merged);
        }`);
}

// Add setting lastSyncTime
if (!content.includes("await db.syncMetadata.setItem('lastSyncTime', syncTimestamp);")) {
  content = content.replace(
    /if \(posSettingsData\) \{([\s\S]*?)setPosSettingsState\(parsed\); await db\.posSettings\.setItem\('data', parsed\);\s*\}/,
    `if (posSettingsData) {$1setPosSettingsState(parsed); await db.posSettings.setItem('data', parsed);
        }
        
        // Update last sync time for next delta fetch
        await db.syncMetadata.setItem('lastSyncTime', syncTimestamp);`
  );
}

fs.writeFileSync(filepath, content, 'utf8');
console.log('AppContext.tsx updated successfully');
