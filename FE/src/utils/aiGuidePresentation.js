import { createElement } from 'react';

function placeListLine(line) {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

function parseWalkingMetrics(line) {
  const walkingMatch = String(line).match(/도보\s*(?:약\s*)?(\d+)\s*분/);
  const distanceMatch = String(line).match(/(\d+(?:\.\d+)?)\s*(km|m)\b/i);
  const distance = distanceMatch ? Number(distanceMatch[1]) : null;
  return {
    walkingMinutes: walkingMatch ? Number(walkingMatch[1]) : null,
    distanceMeters: distanceMatch
      ? Math.round(distanceMatch[2].toLocaleLowerCase() === 'km' ? distance * 1000 : distance)
      : null,
  };
}

export function buildAiGuidePlacePresentation(content, recommendedPlaces) {
  const places = Array.isArray(recommendedPlaces) ? recommendedPlaces : [];
  const placesBySpecificity = [...places].sort((left, right) => (
    String(right?.name ?? '').length - String(left?.name ?? '').length
  ));
  const metricsByPlaceId = new Map();
  const messageLines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n').filter((line) => {
    if (!placeListLine(line)) return true;
    const normalizedLine = line.replace(/\*\*/g, '').toLocaleLowerCase('ko-KR');
    const place = placesBySpecificity.find((candidate) => (
      candidate?.name && normalizedLine.includes(String(candidate.name).toLocaleLowerCase('ko-KR'))
    ));
    if (!place) return true;
    if (!metricsByPlaceId.has(place.id)) metricsByPlaceId.set(place.id, parseWalkingMetrics(line));
    return false;
  });

  const recommendations = places.map((place) => ({
      place,
      walkingMinutes: metricsByPlaceId.get(place.id)?.walkingMinutes ?? null,
      distanceMeters: metricsByPlaceId.get(place.id)?.distanceMeters ?? null,
    }));
  const closestIndex = recommendations.reduce((closest, item, index, source) => {
    if (item.distanceMeters === null) return closest;
    if (closest === -1 || item.distanceMeters < source[closest].distanceMeters) return index;
    return closest;
  }, -1);

  return {
    messageContent: messageLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    recommendations: recommendations.map((item, index) => ({
      ...item,
      reason: index === closestIndex
        ? '가장 가까운 추천 장소예요'
        : item.walkingMinutes !== null
          ? '도보로 이동할 수 있는 곳이에요'
          : null,
    })),
  };
}

function renderInlineMarkdown(value, keyPrefix) {
  const text = String(value ?? '');
  const tokenPattern = /\*\*[^*\n]+?\*\*|`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)/g;
  const nodes = [];
  let cursor = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));

    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(createElement('strong', { key: `${keyPrefix}-strong-${index}` }, token.slice(2, -2)));
    } else if (token.startsWith('`')) {
      nodes.push(createElement('code', { key: `${keyPrefix}-code-${index}` }, token.slice(1, -1)));
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) {
        nodes.push(createElement('a', {
          key: `${keyPrefix}-link-${index}`,
          href: linkMatch[2],
          target: '_blank',
          rel: 'noreferrer',
        }, linkMatch[1]));
      } else {
        nodes.push(token);
      }
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length > 0 ? nodes : [''];
}

export function renderAiGuideMarkdown(content, keyPrefix = 'ai-guide', options = {}) {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (!line.trim()) {
      lineIndex += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const codeLines = [];
      lineIndex += 1;
      while (lineIndex < lines.length && !lines[lineIndex].startsWith('```')) {
        codeLines.push(lines[lineIndex]);
        lineIndex += 1;
      }
      if (lineIndex < lines.length) lineIndex += 1;
      blocks.push(createElement('pre', { className: 'ai-guide-markdown-code', key: `${keyPrefix}-code-${lineIndex}` },
        createElement('code', null, codeLines.join('\n'))));
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      blocks.push(createElement('h3', { className: 'ai-guide-markdown-heading', key: `${keyPrefix}-heading-${lineIndex}` },
        renderInlineMarkdown(heading[1], `${keyPrefix}-heading-${lineIndex}`)));
      lineIndex += 1;
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items = [];
      while (lineIndex < lines.length) {
        const item = ordered ? lines[lineIndex].match(/^\d+[.)]\s+(.+)$/) : lines[lineIndex].match(/^[-*+]\s+(.+)$/);
        if (!item) break;
        const itemKey = `${keyPrefix}-item-${lineIndex}`;
        const placeLink = options.renderListItemFooter?.(item[1], itemKey);
        items.push(createElement('li', { key: itemKey },
          renderInlineMarkdown(item[1], itemKey), placeLink));
        lineIndex += 1;
      }
      blocks.push(createElement(ordered ? 'ol' : 'ul', {
        className: 'ai-guide-markdown-list',
        key: `${keyPrefix}-list-${lineIndex}`,
      }, items));
      continue;
    }

    blocks.push(createElement('p', { className: 'ai-guide-markdown-paragraph', key: `${keyPrefix}-paragraph-${lineIndex}` },
      renderInlineMarkdown(line, `${keyPrefix}-paragraph-${lineIndex}`)));
    lineIndex += 1;
  }

  return blocks.length > 0
    ? blocks
    : [createElement('p', { className: 'ai-guide-markdown-paragraph', key: `${keyPrefix}-empty` }, '')];
}

export function scrollAiGuideToLatest(container, latestMessage, bottomSpacer) {
  if (!container || typeof latestMessage?.scrollIntoView !== 'function') return;
  if (bottomSpacer?.style) {
    bottomSpacer.style.height = `${Math.max(0, container.clientHeight - latestMessage.offsetHeight)}px`;
  }
  latestMessage.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
