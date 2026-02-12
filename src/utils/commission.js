export const formatCurrency = (value) => {
  if (Number.isNaN(value)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const sumPayments = (payments) =>
  payments.reduce((acc, payment) => acc + payment.amount, 0);

const getSalePaidAmount = (sale) => {
  if (!sale) return 0;
  if (typeof sale.paidAmount === "number") return sale.paidAmount;
  if (Array.isArray(sale.payments)) return sumPayments(sale.payments);
  return 0;
};

const isSalePaid = (sale) => {
  if (!sale || sale.status === "cancelled") return false;
  const total = Number(sale.totalAmount || 0);
  if (!total) return false;
  return getSalePaidAmount(sale) >= total;
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

export const buildSalesIndex = (sales) => {
  const index = {};
  sales.forEach((sale) => {
    if (sale.status === "cancelled") return;
    if (!isSalePaid(sale)) return;
    if (!index[sale.sellerId]) {
      index[sale.sellerId] = { totalArea: 0, lastSale: "-" };
    }
    index[sale.sellerId].totalArea += sale.areaSqYd;
    index[sale.sellerId].lastSale = sale.saleDate;
  });
  Object.values(index).forEach((entry) => {
    entry.lastSale = formatDate(entry.lastSale);
  });
  return index;
};

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
    .filter((sale) => sale.sellerId === personId && isSalePaid(sale))
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

export const getStageRecruitCount = (personId, peopleIndex) => {
  const person = peopleIndex[personId];
  if (!person) return 0;
  return person.directRecruits.length;
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
    if (!isSalePaid(sale)) return;
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
    if (person.isSpecial) return;
    const paidInvestments = person.investments
      ? person.investments.filter((inv) => inv.paymentStatus === "paid")
      : [];
    const investment = paidInvestments.sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    )[0];
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
