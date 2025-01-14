'use strict';

const createDebug = require('debug');
const {
  HTTPError,
  PermissionError,
  UserNotFoundError,
} = require('../errors');
const skipIfCurrentDJ = require('../utils/skipIfCurrentDJ');
const removeFromWaitlist = require('../utils/removeFromWaitlist');
const getOffsetPagination = require('../utils/getOffsetPagination');
const toItemResponse = require('../utils/toItemResponse');
const toListResponse = require('../utils/toListResponse');
const toPaginatedResponse = require('../utils/toPaginatedResponse');
const beautifyDuplicateKeyError = require('../utils/beautifyDuplicateKeyError');
const { muteUser, unmuteUser } = require('./chat');

const debug = createDebug('uwave:http:users');

async function getUsers(req) {
  const { filter } = req.query;
  const pagination = getOffsetPagination(req.query, {
    defaultSize: 50,
  });
  const { users } = req.uwave;

  debug('getUsers', filter, pagination);

  const userList = await users.getUsers(filter, pagination);

  return toPaginatedResponse(userList, {
    baseUrl: req.fullUrl,
    filter,
  });
}

async function getUser(req) {
  const { users } = req.uwave;
  const { id: userID } = req.params;

  const user = await users.getUser(userID);
  if (!user) {
    throw new UserNotFoundError({ id: userID });
  }

  return toItemResponse(user, {
    url: req.fullUrl,
  });
}

async function getUserRoles(req) {
  const { acl, users } = req.uwave;
  const { id } = req.params;

  const user = await users.getUser(id);
  if (!user) {
    throw new UserNotFoundError({ id });
  }

  const roles = await acl.getAllPermissions(user);

  return toListResponse(roles, {
    url: req.fullUrl,
  });
}

async function addUserRole(req) {
  const { user: moderator } = req;
  const { id, role } = req.params;
  const { acl, users } = req.uwave;

  const selfHasRole = await acl.isAllowed(moderator, role);
  if (!selfHasRole) {
    throw new PermissionError('You cannot assign roles you do not have');
  }

  const user = await users.getUser(id);
  if (!user) {
    throw new UserNotFoundError({ id });
  }

  await acl.allow(user, [role]);

  return toItemResponse({}, {
    url: req.fullUrl,
  });
}

async function removeUserRole(req) {
  const { user: moderator } = req;
  const { id, role } = req.params;
  const { acl, users } = req.uwave;

  const selfHasRole = await acl.isAllowed(moderator, role);
  if (!selfHasRole) {
    throw new PermissionError('You cannot remove roles you do not have');
  }

  const user = await users.getUser(id);
  if (!user) {
    throw new UserNotFoundError({ id });
  }

  await acl.disallow(user, [role]);

  return toItemResponse({}, {
    url: req.fullUrl,
  });
}

async function startDispenser(req) {
  const { id } = req.params;
  const { leveling } = req.uwave;

  await leveling.dispenseExp(id);

  return toItemResponse({}, {
    url: req.fullUrl,
  });
}

async function changeUsername(req) {
  const { user: moderator } = req;
  const { id } = req.params;
  const { username } = req.body;
  const { users } = req.uwave;

  try {
    const user = await users.updateUser(
      id,
      { username },
      { moderator },
    );

    return toItemResponse(user);
  } catch (error) {
    throw beautifyDuplicateKeyError(error);
  }
}

async function changeDiscordId(req) {
  const { user: moderator } = req;
  const { id } = req.params;
  const { discordId } = req.body;
  const { users } = req.uwave;

  try {
    const user = await users.updateUser(
      id,
      { discordId },
      { moderator },
    );

    return toItemResponse(user);
  } catch (error) {
    throw beautifyDuplicateKeyError(error);
  }
}

async function changeAvatar() {
  throw new HTTPError(500, 'Not implemented');
}

async function disconnectUser(uw, user) {
  const userID = typeof user === 'object' ? `${user._id}` : user;

  await skipIfCurrentDJ(uw, userID);

  try {
    await removeFromWaitlist(uw, userID);
  } catch (e) {
    // Ignore
  }

  await uw.redis.lrem('users', 0, userID);

  uw.publish('user:leave', { userID });
}

async function getHistory(req) {
  const { id } = req.params;
  const pagination = getOffsetPagination(req.query, {
    defaultSize: 25,
    maxSize: 100,
  });
  const uw = req.uwave;

  const user = await uw.users.getUser(id);
  if (!user) {
    throw new UserNotFoundError({ id });
  }

  const history = await uw.history.getUserHistory(user, pagination);

  return toPaginatedResponse(history, {
    baseUrl: req.fullUrl,
    included: {
      media: ['media.media'],
      user: ['user'],
    },
  });
}

exports.getUsers = getUsers;
exports.getUser = getUser;
exports.getUserRoles = getUserRoles;
exports.addUserRole = addUserRole;
exports.removeUserRole = removeUserRole;
exports.changeUsername = changeUsername;
exports.changeDiscordId = changeDiscordId;
exports.changeAvatar = changeAvatar;
exports.disconnectUser = disconnectUser;
exports.getHistory = getHistory;
exports.muteUser = muteUser;
exports.unmuteUser = unmuteUser;
exports.startDispenser = startDispenser;
