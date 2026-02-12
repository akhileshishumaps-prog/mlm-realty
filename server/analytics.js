const STAGE_THRESHOLDS = [18, 72, 288, 1152, 4608, 9216, 18432];

const sortByDate = (items) =>
  [...items].sort((a, b) => new Date(a.date) - new Date(b.date));

const normalizeConfigHistory = (history, fallback) => {
  const safeFallback = fallback || {
    levelRates: [],
    personalRates: [],
  };
  const cleaned = Array.isArray(history)
    ? history
        .map((entry) => ({
          createdAt: entry.createdAt || entry.created_at || entry.created || "",
          levelRates: entry.levelRates || entry.level_rates || [],
          personalRates: entry.personalRates || entry.personal_rates || [],
        }))
        .filter((entry) => entry.createdAt)
    : [];
  cleaned.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (cleaned.length) return cleaned;
  return [
    {
      createdAt: "1970-01-01T00:00:00.000Z",
      levelRates: safeFallback.levelRates || [],
      personalRates: safeFallback.personalRates || [],
    },
  ];
};

const getConfigForDate = (history, date) => {
  if (!history.length) return null;
  if (!date) return history[history.length - 1];
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return history[history.length - 1];
  let selected = history[0];
  for (const entry of history) {
    const entryTime = new Date(entry.createdAt).getTime();
    if (!Number.isNaN(entryTime) && entryTime <= target) {
      selected = entry;
    } else if (!Number.isNaN(entryTime) && entryTime > target) {
      break;
    }
  }
  return selected;
};

export const buildPeopleIndex = (people) => {
  const index = {};
  people.forEach((person) => {
    index[person.id] = { ...person, directRecruits: [] };
  });
  people.forEach((person) => {
    if (person.sponsorId && index[person.sponsorId]) {
      index[person.sponsorId].directRecruits.push(person.id);
    }
  });
  return index;
};

const getDownlineIds = (personId, peopleIndex, maxLevels = 9) => {
  const queue = [{ id: personId, level: 0 }];
  const ids = [];
  while (queue.length) {
    const current = queue.shift();
    if (current.level >= maxLevels) continue;
    const node = peopleIndex[current.id];
    if (!node) continue;
    node.directRecruits.forEach((childId) => {
      ids.push(childId);
      queue.push({ id: childId, level: current.level + 1 });
    });
  }
  return ids;
};

const getStage2EntryDate = (personId, peopleIndex) => {
  const directIds = peopleIndex[personId]?.directRecruits || [];
  if (directIds.length < 6) return null;
  const directDates = directIds
    .map((id) => ({
      id,
      date: peopleIndex[id]?.joinDate,
    }))
    .filter((entry) => entry.date);
  if (directDates.length < 6) return null;
  return sortByDate(directDates)[5].date;
};

const getStageEvents = (personId, peopleIndex, sales) => {
  const downlineIds = getDownlineIds(personId, peopleIndex, 9);
  const downlineEvents = downlineIds
    .map((id) => ({
      date: peopleIndex[id]?.joinDate,
      type: "recruit",
    }))
    .filter((entry) => entry.date);
  const personalSales = sales
    .filter((sale) => sale.sellerId === personId && sale.status !== "cancelled")
    .map((sale) => ({ date: sale.saleDate, type: "sale" }))
    .filter((entry) => entry.date);
  return sortByDate([...downlineEvents, ...personalSales]);
};

export const getStageSummary = (person, peopleIndex, sales) => {
  const directRecruits = peopleIndex[person.id]?.directRecruits.length || 0;
  if (directRecruits < 6) {
    return {
      stage: 1,
      directRecruits,
      progress: directRecruits,
      nextTarget: 6,
    };
  }

  let stage = 2;
  const entryDate = getStage2EntryDate(person.id, peopleIndex);
  const events = getStageEvents(person.id, peopleIndex, sales).filter(
    (event) => !entryDate || new Date(event.date) > new Date(entryDate)
  );
  let progress = 0;
  let nextTarget = STAGE_THRESHOLDS[0];

  if (entryDate) {
    let cursor = 0;
    for (let i = 0; i < STAGE_THRESHOLDS.length; i += 1) {
      const threshold = STAGE_THRESHOLDS[i];
      const remaining = events.length - cursor;
      if (remaining >= threshold) {
        stage = 3 + i;
        cursor += threshold;
        nextTarget = STAGE_THRESHOLDS[i + 1] ?? null;
        progress = nextTarget ? 0 : remaining - threshold;
      } else {
        progress = remaining;
        nextTarget = threshold;
        break;
      }
    }
  }

  if (stage >= 9) {
    return {
      stage: 9,
      directRecruits,
      progress,
      nextTarget: null,
    };
  }

  return {
    stage,
    directRecruits,
    progress,
    nextTarget,
  };
};

const buildUpline = (personId, peopleIndex, maxLevels = 9) => {
  const upline = [];
  let current = peopleIndex[personId];
  let level = 1;
  while (current && current.sponsorId && level <= maxLevels) {
    const sponsor = peopleIndex[current.sponsorId];
    if (!sponsor) break;
    upline.push({ level, sponsor });
    current = sponsor;
    level += 1;
  }
  return upline;
};

export const getDownlineDepth = (personId, peopleIndex, maxLevels = 9) => {
  const queue = [{ id: personId, level: 0 }];
  let maxDepth = 0;
  while (queue.length) {
    const current = queue.shift();
    maxDepth = Math.max(maxDepth, current.level);
    if (current.level >= maxLevels) continue;
    const node = peopleIndex[current.id];
    node.directRecruits.forEach((childId) => {
      queue.push({ id: childId, level: current.level + 1 });
    });
  }
  return maxDepth;
};

export const calculateCommissionSummary = (
  people,
  sales,
  config,
  commissionPayments = [],
  configHistory = []
) => {
  const peopleIndex = buildPeopleIndex(people);
  const commissionByPerson = {};
  const normalizedHistory = normalizeConfigHistory(configHistory, config);
  const latestConfig = normalizedHistory[normalizedHistory.length - 1] || config;

  const paidTotals = commissionPayments.reduce((acc, payment) => {
    const current = acc[payment.person_id] || 0;
    acc[payment.person_id] = current + payment.amount;
    return acc;
  }, {});

  people.forEach((person) => {
    const stageSummary = getStageSummary(person, peopleIndex, sales);
    const personalRate =
      latestConfig.personalRates?.[stageSummary.stage - 1] ?? 0;
    commissionByPerson[person.id] = {
      person,
      stage: stageSummary.stage,
      personalRate,
      totalCommission: 0,
      totalPaid: paidTotals[person.id] || 0,
      maxLevel: getDownlineDepth(person.id, peopleIndex),
    };
  });

  sales.filter((sale) => sale.status !== "cancelled").forEach((sale) => {
    const seller = peopleIndex[sale.sellerId];
    if (!seller) return;
    const stageSummary = getStageSummary(seller, peopleIndex, sales);
    const configForSale = getConfigForDate(normalizedHistory, sale.saleDate);
    const rate =
      configForSale?.personalRates?.[stageSummary.stage - 1] ?? 0;
    const selfCommission = sale.areaSqYd * rate;
    commissionByPerson[seller.id].totalCommission += selfCommission;
  });

  people.forEach((person) => {
    if (!person.sponsorId) return;
    const investment = person.investments
      ? [...person.investments].sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        )[0]
      : null;
    const investmentArea = investment?.areaSqYd || 0;
    if (!investmentArea) return;
    const upline = buildUpline(person.id, peopleIndex, 9);
    const configForInvestment = getConfigForDate(
      normalizedHistory,
      investment?.date
    );
    upline.forEach(({ level, sponsor }) => {
      const rate = configForInvestment?.levelRates?.[level - 1] || 0;
      const commission = investmentArea * rate;
      commissionByPerson[sponsor.id].totalCommission += commission;
    });
  });

  const peopleRows = Object.values(commissionByPerson);
  const topEarners = [...peopleRows]
    .sort((a, b) => b.totalCommission - a.totalCommission)
    .slice(0, 4);
  const totalCommission = peopleRows.reduce(
    (acc, row) => acc + row.totalCommission,
    0
  );

  return {
    byPerson: commissionByPerson,
    peopleRows,
    topEarners,
    totalCommission,
  };
};

export const toPeopleModel = (peopleRows, investmentsRows) => {
  const investmentsByPerson = investmentsRows.reduce((acc, inv) => {
    acc[inv.person_id] = acc[inv.person_id] || [];
    acc[inv.person_id].push({
      stage: inv.stage,
      amount: inv.amount,
      areaSqYd: inv.area_sq_yd ?? 0,
      date: inv.date,
      buybackDate: inv.buyback_date,
      buybackMonths: inv.buyback_months ?? 36,
      returnPercent: inv.return_percent ?? 200,
      projectId: inv.project_id || "",
      blockId: inv.block_id || "",
      propertyId: inv.property_id || "",
      status: inv.status,
      paidAmount: inv.paid_amount,
      paidDate: inv.paid_date,
      id: inv.id,
    });
    return acc;
  }, {});

  return peopleRows.map((person) => ({
    ...person,
    sponsorId: person.sponsor_id,
    sponsorStage: person.sponsor_stage ?? (person.sponsor_id ? 1 : null),
    joinDate: person.join_date,
    investments: investmentsByPerson[person.id] || [],
  }));
};

export const toSalesModel = (salesRows) =>
  salesRows.map((sale) => ({
    ...sale,
    sellerId: sale.seller_id,
    propertyName: sale.property_name,
    areaSqYd: sale.area_sq_yd,
    totalAmount: sale.total_amount,
    saleDate: sale.sale_date,
    status: sale.status || "active",
    cancelledAt: sale.cancelled_at,
    projectId: sale.project_id || "",
    blockId: sale.block_id || "",
    propertyId: sale.property_id || "",
  }));
