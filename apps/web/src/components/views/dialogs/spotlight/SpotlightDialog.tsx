/*
Copyright 2024 New Vector Ltd.
Copyright 2021-2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type WebSearch as WebSearchEvent } from "@matrix-org/analytics-events/types/typescript/WebSearch";
import { capitalize, sum } from "lodash";
import {
    type HierarchyRoom,
    type IPublicRoomsChunkRoom,
    JoinRule,
    type MatrixClient,
    type Room,
    RoomMember,
    RoomType,
} from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { normalize } from "matrix-js-sdk/src/utils";
import React, {
    type ChangeEvent,
    type JSX,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import sanitizeHtml from "sanitize-html";
import {
    ChatIcon,
    RoomIcon,
    SpaceIcon,
    UserProfileIcon,
    FavouriteIcon,
    HomeIcon,
    GroupIcon,
    CloseIcon,
    LinkIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { KeyBindingAction } from "../../../../accessibility/KeyboardShortcuts";
import {
    findNextSiblingElement,
    RovingStateActionType,
    RovingTabIndexContext,
    RovingTabIndexProvider,
} from "../../../../accessibility/RovingTabIndex";
import { mediaFromMxc } from "../../../../customisations/Media";
import { Action } from "../../../../dispatcher/actions";
import defaultDispatcher from "../../../../dispatcher/dispatcher";
import { type ViewRoomPayload } from "../../../../dispatcher/payloads/ViewRoomPayload";
import { useDebouncedCallback } from "../../../../hooks/spotlight/useDebouncedCallback";
import { useRecentSearches } from "../../../../hooks/spotlight/useRecentSearches";
import { useProfileInfo } from "../../../../hooks/useProfileInfo";
import { usePublicRoomDirectory } from "../../../../hooks/usePublicRoomDirectory";
import { useSpaceResults } from "../../../../hooks/useSpaceResults";
import { useUserDirectory } from "../../../../hooks/useUserDirectory";
import { getKeyBindingsManager } from "../../../../KeyBindingsManager";
import { _t } from "../../../../languageHandler";
import { MatrixClientPeg } from "../../../../MatrixClientPeg";
import { PosthogAnalytics } from "../../../../PosthogAnalytics";
import { getCachedRoomIdForAlias } from "../../../../RoomAliasCache";
import { showStartChatInviteDialog } from "../../../../RoomInvite";
import { SettingLevel } from "../../../../settings/SettingLevel";
import SettingsStore from "../../../../settings/SettingsStore";
import { BreadcrumbsStore } from "../../../../stores/BreadcrumbsStore";
import { type RoomNotificationState } from "../../../../stores/notifications/RoomNotificationState";
import { RoomNotificationStateStore } from "../../../../stores/notifications/RoomNotificationStateStore";
import { RecentAlgorithm } from "../../../../stores/room-list/algorithms/tag-sorting/RecentAlgorithm";
import { SdkContextClass } from "../../../../contexts/SDKContext";
import { getMetaSpaceName, MetaSpace } from "../../../../stores/spaces";
import SpaceStore from "../../../../stores/spaces/SpaceStore";
import { DirectoryMember, type Member, startDmOnFirstMessage } from "../../../../utils/direct-messages";
import DMRoomMap from "../../../../utils/DMRoomMap";
import { makeUserPermalink } from "../../../../utils/permalinks/Permalinks";
import { buildActivityScores, buildMemberScores, compareMembers } from "../../../../utils/SortMembers";
import { copyPlaintext } from "../../../../utils/strings";
import BaseAvatar from "../../avatars/BaseAvatar";
import DecoratedRoomAvatar from "../../avatars/DecoratedRoomAvatar";
import { SearchResultAvatar } from "../../avatars/SearchResultAvatar";
import { NetworkDropdown } from "../../directory/NetworkDropdown";
import AccessibleButton, { type ButtonEvent } from "../../elements/AccessibleButton";
import Spinner from "../../elements/Spinner";
import NotificationBadge from "../../rooms/NotificationBadge";
import BaseDialog from "../BaseDialog";
import { Option } from "./Option";
import { PublicRoomResultDetails } from "./PublicRoomResultDetails";
import { RoomResultContextMenus } from "./RoomResultContextMenus";
import { RoomContextDetails } from "../../rooms/RoomContextDetails";
import { TooltipOption } from "./TooltipOption";
import { isLocalRoom } from "../../../../utils/localRoom/isLocalRoom";
import RoomAvatar from "../../avatars/RoomAvatar";
import { useFeatureEnabled } from "../../../../hooks/useSettings";
import { filterBoolean } from "../../../../utils/arrays";
import { transformSearchTerm } from "../../../../utils/SearchInput";
import { Filter } from "./Filter";
import { useDiscoverRooms, type DiscoverRoom } from "../../../../hooks/useDiscoverRooms";
import { useJoinByKeyword } from "../../../../hooks/useJoinByKeyword";
import { useDiscoverBundles } from "../../../../hooks/useDiscoverBundles";
import { type Bundle, inviteBundle } from "../../../../bundles/bundleApi";

const MAX_RECENT_SEARCHES = 10;
const SECTION_LIMIT = 50; // only show 50 results per section for performance reasons
const AVATAR_SIZE = "24px";

interface IProps {
    initialText?: string;
    initialFilter?: Filter;
    onFinished(this: void): void;
}

function nodeIsForRecentlyViewed(node?: HTMLElement): boolean {
    return node?.id?.startsWith("mx_SpotlightDialog_button_recentlyViewed_") === true;
}

function getRoomTypes(filter: Filter | null): Set<RoomType | null> {
    const roomTypes = new Set<RoomType | null>();

    if (filter === Filter.PublicRooms) roomTypes.add(null);
    if (filter === Filter.PublicSpaces) roomTypes.add(RoomType.Space);

    return roomTypes;
}

enum Section {
    People,
    Rooms,
    Spaces,
    Suggestions,
    PublicRoomsAndSpaces,
    Bundles,
    DiscoverSpaces,
}

function filterToLabel(filter: Filter): string {
    switch (filter) {
        case Filter.People:
            return _t("common|people");
        case Filter.PublicRooms:
            return _t("spotlight_dialog|public_rooms_label");
        case Filter.PublicSpaces:
            return _t("spotlight_dialog|public_spaces_label");
         case Filter.Bundles:
            return "Bundles";
    }
}

function filterToIcon(filter: Filter): JSX.Element {
    switch (filter) {
        case Filter.People:
            return <UserProfileIcon />;
        case Filter.PublicRooms:
            return <RoomIcon />;
        case Filter.PublicSpaces:
            return <SpaceIcon />;
        case Filter.Bundles:
            return <RoomIcon />;
    }
}

function metaspaceToIcon(key: MetaSpace): JSX.Element | undefined {
    switch (key) {
        case MetaSpace.Home:
            return <HomeIcon />;
        case MetaSpace.Favourites:
            return <FavouriteIcon />;
        case MetaSpace.People:
            return <UserProfileIcon />;
        case MetaSpace.Orphans:
            return <RoomIcon />;
    }
}

interface IBaseResult {
    section: Section;
    filter: Filter[];
    query?: string[]; // extra fields to query match, stored as lowercase
}

interface IPublicRoomResult extends IBaseResult {
    publicRoom: IPublicRoomsChunkRoom;
}

interface IDiscoverRoomResult extends IBaseResult {
    discoverRoom: DiscoverRoom;
}

interface IBundleResult extends IBaseResult {
    bundle: Bundle;
}

interface IRoomResult extends IBaseResult {
    room: Room;
}

interface IMemberResult extends IBaseResult {
    member: Member | RoomMember;
    /**
     * If the result is from a filtered server API then we set true here to avoid locally culling it in our own filters
     */
    alreadyFiltered: boolean;
}

interface IResult extends IBaseResult {
    avatar: JSX.Element;
    name: string;
    description?: string;
    onClick?(this: void): void;
}

type Result = IRoomResult | IPublicRoomResult | IMemberResult | IResult | IDiscoverRoomResult | IBundleResult;

const isRoomResult = (result: any): result is IRoomResult => !!result?.room;
const isPublicRoomResult = (result: any): result is IPublicRoomResult => !!result?.publicRoom;
const isDiscoverRoomResult = (result: any): result is IDiscoverRoomResult => !!result?.discoverRoom;
const isBundleResult = (result: any): result is IBundleResult => !!result?.bundle;
const isMemberResult = (result: any): result is IMemberResult => !!result?.member;

const toPublicRoomResult = (publicRoom: IPublicRoomsChunkRoom): IPublicRoomResult => ({
    publicRoom,
    section: Section.PublicRoomsAndSpaces,
    filter: [Filter.PublicRooms, Filter.PublicSpaces],
    query: filterBoolean([
        publicRoom.room_id.toLowerCase(),
        publicRoom.canonical_alias?.toLowerCase(),
        publicRoom.name?.toLowerCase(),
        sanitizeHtml(publicRoom.topic?.toLowerCase() ?? "", { allowedTags: [] }),
        ...(publicRoom.aliases?.map((it) => it.toLowerCase()) || []),
    ]),
});

const toDiscoverRoomResult = (discoverRoom: DiscoverRoom): IDiscoverRoomResult => {
    const isSpace = discoverRoom.room_kind === "space";

    return {
        discoverRoom,
        section: isSpace ? Section.DiscoverSpaces : Section.PublicRoomsAndSpaces,
        filter: isSpace
            ? [Filter.PublicSpaces, Filter.PublicRooms]   // <-- PublicRooms também, pro space passar ao abrir (igual bundle)
            : [Filter.PublicRooms],
        query: filterBoolean([
            discoverRoom.room_id.toLowerCase(),
            discoverRoom.name?.toLowerCase(),
        ]),
    };
};

const toBundleResult = (bundle: Bundle): IBundleResult => ({
    bundle,
    section: Section.Bundles,
    filter: [Filter.Bundles, Filter.PublicRooms],
    query: filterBoolean([
        bundle.bundle_id.toLowerCase(),
        bundle.bundle_name?.toLowerCase(),
    ]),
});

const toRoomResult = (room: Room): IRoomResult => {
    const myUserId = MatrixClientPeg.safeGet().getUserId();
    const otherUserId = DMRoomMap.shared().getUserIdForRoomId(room.roomId);

    if (otherUserId) {
        const otherMembers = room.getMembers().filter((it) => it.userId !== myUserId);
        const query = [
            ...otherMembers.map((it) => it.name.toLowerCase()),
            ...otherMembers.map((it) => it.userId.toLowerCase()),
        ].filter(Boolean);
        return {
            room,
            section: Section.People,
            filter: [Filter.People],
            query,
        };
    } else if (room.isSpaceRoom()) {
        return {
            room,
            section: Section.Spaces,
            filter: [],
        };
    } else {
        return {
            room,
            section: Section.Rooms,
            filter: [],
        };
    }
};

const toMemberResult = (member: Member | RoomMember, alreadyFiltered: boolean): IMemberResult => ({
    alreadyFiltered,
    member,
    section: Section.Suggestions,
    filter: [Filter.People],
    query: [member.userId.toLowerCase(), member.name.toLowerCase()].filter(Boolean),
});

const recentAlgorithm = new RecentAlgorithm();

export const useWebSearchMetrics = (numResults: number, queryLength: number, viaSpotlight: boolean): void => {
    useEffect(() => {
        if (!queryLength) return;

        // send metrics after a 1s debounce
        const timeoutId = window.setTimeout(() => {
            PosthogAnalytics.instance.trackEvent<WebSearchEvent>({
                eventName: "WebSearch",
                viaSpotlight,
                numResults,
                queryLength,
            });
        }, 1000);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [numResults, queryLength, viaSpotlight]);
};

const findVisibleRooms = (cli: MatrixClient, msc3946ProcessDynamicPredecessor: boolean): Room[] => {
    return cli.getVisibleRooms(msc3946ProcessDynamicPredecessor).filter((room) => {
        // Do not show local rooms
        if (isLocalRoom(room)) return false;

        // TODO we may want to put invites in their own list
        return room.getMyMembership() === KnownMembership.Join || room.getMyMembership() == KnownMembership.Invite;
    });
};

const findVisibleRoomMembers = (visibleRooms: Room[], cli: MatrixClient, filterDMs = true): RoomMember[] => {
    return Object.values(
        visibleRooms
            .filter((room) => !filterDMs || !DMRoomMap.shared().getUserIdForRoomId(room.roomId))
            .reduce(
                (members, room) => {
                    for (const member of room.getJoinedMembers()) {
                        members[member.userId] = member;
                    }
                    return members;
                },
                {} as Record<string, RoomMember>,
            ),
    ).filter((it) => it.userId !== cli.getUserId());
};

const roomAriaUnreadLabel = (room: Room, notification: RoomNotificationState): string | undefined => {
    if (notification.hasMentions) {
        return _t("a11y|n_unread_messages_mentions", {
            count: notification.count,
        });
    } else if (notification.hasUnreadCount) {
        return _t("a11y|n_unread_messages", {
            count: notification.count,
        });
    } else if (notification.isUnread) {
        return _t("a11y|unread_messages");
    } else {
        return undefined;
    }
};

const canAskToJoin = (joinRule?: JoinRule): boolean => {
    return SettingsStore.getValue("feature_ask_to_join") && JoinRule.Knock === joinRule;
};

interface IDirectoryOpts {
    limit: number;
    query: string;
}

const SpotlightDialog: React.FC<IProps> = ({ initialText = "", initialFilter = null, onFinished }) => {
    const [payingRoom, setPayingRoom] = useState<DiscoverRoom | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [payingBundle, setPayingBundle] = useState<Bundle | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const cli = MatrixClientPeg.safeGet();
    const rovingContext = useContext(RovingTabIndexContext);
    const [query, _setQuery] = useState(initialText);
    const [recentSearches, clearRecentSearches] = useRecentSearches();
    const [filter, setFilterInternal] = useState<Filter | null>(initialFilter);
    // Ao abrir via "Explorar" (bússola → initialFilter=PublicRooms), o chip de
    // Bundles também fica ativo junto com Salas públicas, cada um com seu
    // próprio pill. Fechável independentemente, sem afetar o `filter` principal.
    const [showBundlesChip, setShowBundlesChip] = useState<boolean>(initialFilter === Filter.PublicRooms);
    const [showSpacesChip, setShowSpacesChip] = useState<boolean>(initialFilter === Filter.PublicRooms);
    const setFilter = useCallback((filter: Filter | null) => {
        setFilterInternal(filter);
        inputRef.current?.focus();
        scrollContainerRef.current?.scrollTo?.({ top: 0 });
    }, []);
    const memberComparator = useMemo(() => {
        const activityScores = buildActivityScores(cli);
        const memberScores = buildMemberScores(cli);
        return compareMembers(activityScores, memberScores);
    }, [cli]);
    const msc3946ProcessDynamicPredecessor = useFeatureEnabled("feature_dynamic_room_predecessors");

    const ownInviteLink = makeUserPermalink(cli.getUserId()!);
    const [inviteLinkCopied, setInviteLinkCopied] = useState<boolean>(false);
    const trimmedQuery = useMemo(() => query.trim(), [query]);

    const [supportsSpaceFiltering, setSupportsSpaceFiltering] = useState(true); // assume it does until we find out it doesn't
    useEffect(() => {
        cli.isVersionSupported("v1.4")
            .then((supported) => {
                return supported || cli.doesServerSupportUnstableFeature("org.matrix.msc3827.stable");
            })
            .then((supported) => {
                setSupportsSpaceFiltering(supported);
            });
    }, [cli]);

    const {
        loading: publicRoomsLoading,
        publicRooms,
        protocols,
        config,
        setConfig,
        search: searchPublicRooms,
        error: publicRoomsError,
    } = usePublicRoomDirectory();
    const { loading: bundlesLoading, bundles, error: bundlesError } = useDiscoverBundles();
    const { loading: discoverLoading, rooms: discoverRooms, error: discoverError } = useDiscoverRooms();
    const { joinByKeyword } = useJoinByKeyword();
    const { loading: peopleLoading, users: userDirectorySearchResults, search: searchPeople } = useUserDirectory();
    const { loading: profileLoading, profile, search: searchProfileInfo } = useProfileInfo();
    const searchParams: [IDirectoryOpts] = useMemo(
        () => [
            {
                query: trimmedQuery,
                roomTypes: getRoomTypes(filter),
                limit: SECTION_LIMIT,
            },
        ],
        [trimmedQuery, filter],
    );
    useDebouncedCallback(
        filter === Filter.PublicRooms || filter === Filter.PublicSpaces,
        searchPublicRooms,
        searchParams,
    );
    useDebouncedCallback(filter === Filter.People, searchPeople, searchParams);
    useDebouncedCallback(filter === Filter.People, searchProfileInfo, searchParams);

    const possibleResults = useMemo<Result[]>(() => {
        const visibleRooms = findVisibleRooms(cli, msc3946ProcessDynamicPredecessor);
        const roomResults = visibleRooms.map(toRoomResult);
        const userResults: IMemberResult[] = [];

        // If we already have a DM with the user we're looking for, we will show that DM instead of the user themselves
        const alreadyAddedUserIds = roomResults.reduce((userIds, result) => {
            const userId = DMRoomMap.shared().getUserIdForRoomId(result.room.roomId);
            if (!userId) return userIds;
            if (result.room.getJoinedMemberCount() > 2) return userIds;
            userIds.set(userId, result);
            return userIds;
        }, new Map<string, IMemberResult | IRoomResult>());

        function addUserResults(users: Array<Member | RoomMember>, alreadyFiltered: boolean): void {
            for (const user of users) {
                // Make sure we don't have any user more than once
                if (alreadyAddedUserIds.has(user.userId)) {
                    const result = alreadyAddedUserIds.get(user.userId)!;
                    if (alreadyFiltered && isMemberResult(result) && !result.alreadyFiltered) {
                        // But if they were added as not yet filtered then mark them as already filtered to avoid
                        // culling this result based on local filtering.
                        result.alreadyFiltered = true;
                    }
                    continue;
                }
                const result = toMemberResult(user, alreadyFiltered);
                alreadyAddedUserIds.set(user.userId, result);
                userResults.push(result);
            }
        }
        addUserResults(findVisibleRoomMembers(visibleRooms, cli), false);
        addUserResults(userDirectorySearchResults, true);
        if (profile) {
            addUserResults([new DirectoryMember(profile)], true);
        }

        return [
            ...SpaceStore.instance.enabledMetaSpaces.map((spaceKey) => ({
                section: Section.Spaces,
                filter: [] as Filter[],
                avatar: <div className="mx_SpotlightDialog_metaspaceResult">{metaspaceToIcon(spaceKey)}</div>,
                name: getMetaSpaceName(spaceKey, SpaceStore.instance.allRoomsInHome),
                onClick() {
                    SpaceStore.instance.setActiveSpace(spaceKey);
                },
            })),
            ...roomResults,
            ...userResults,
            ...discoverRooms.map(toDiscoverRoomResult),
            ...bundles.map(toBundleResult),
        ].filter((result) => filter === null || result.filter.includes(filter));
    }, [cli, userDirectorySearchResults, profile, discoverRooms, bundles, filter, msc3946ProcessDynamicPredecessor]);

    const results = useMemo<Record<Section, Result[]>>(() => {
        const results: Record<Section, Result[]> = {
            [Section.People]: [],
            [Section.Rooms]: [],
            [Section.Spaces]: [],
            [Section.Suggestions]: [],
            [Section.PublicRoomsAndSpaces]: [],
            [Section.Bundles]: [],
            [Section.DiscoverSpaces]: [],
        };

        // Group results in their respective sections
        if (trimmedQuery) {
            const lcQuery = trimmedQuery.toLowerCase();
            const normalizedQuery = normalize(trimmedQuery);

            possibleResults.forEach((entry) => {
                if (isRoomResult(entry)) {
                    // If the room is a DM with a user that is part of the user directory search results,
                    // we can assume the user is a relevant result, so include the DM with them too.
                    const userId = DMRoomMap.shared().getUserIdForRoomId(entry.room.roomId);
                    if (!userDirectorySearchResults.some((user) => user.userId === userId)) {
                        if (
                            !entry.room.normalizedName?.includes(normalizedQuery) &&
                            !entry.room.getCanonicalAlias()?.toLowerCase().includes(lcQuery) &&
                            !entry.query?.some((q) => q.includes(lcQuery))
                        ) {
                            return; // bail, does not match query
                        }
                    }
                } else if (isMemberResult(entry)) {
                    if (!entry.alreadyFiltered && !entry.query?.some((q) => q.includes(lcQuery))) return; // bail, does not match query
                } else if (isPublicRoomResult(entry)|| isDiscoverRoomResult(entry) || isBundleResult(entry)) {
                    if (!entry.query?.some((q) => q.includes(lcQuery))) return; // bail, does not match query
                } else {
                    if (!entry.name.toLowerCase().includes(lcQuery) && !entry.query?.some((q) => q.includes(lcQuery)))
                        return; // bail, does not match query
                }

                results[entry.section].push(entry);
            });
        } else if (filter === Filter.PublicRooms || filter === Filter.PublicSpaces) {
            // return all results for public rooms (and bundles, when that chip is also active) if no query is given
            possibleResults.forEach((entry) => {
                if (isPublicRoomResult(entry) || isDiscoverRoomResult(entry)) {
                    results[entry.section].push(entry);
                } else if (filter === Filter.PublicRooms && showBundlesChip && isBundleResult(entry)) {
                    results[entry.section].push(entry);
                } else if (
                    filter === Filter.PublicRooms &&
                    showSpacesChip &&
                    isDiscoverRoomResult(entry) &&
                    entry.discoverRoom.room_kind === "space"
                ) {
                    results[entry.section].push(entry);
                }
            });
        } else if (filter === Filter.Bundles) {
            // return all bundles if no query is given
            possibleResults.forEach((entry) => {
                if (isBundleResult(entry)) {
                    results[entry.section].push(entry);
                }
            });
        } else if (filter === Filter.People) {
            // return all results for people if no query is given
            possibleResults.forEach((entry) => {
                if (isMemberResult(entry)) {
                    results[entry.section].push(entry);
                }
            });
        }

        // Sort results by most recent activity

        const myUserId = cli.getSafeUserId();
        for (const resultArray of Object.values(results)) {
            resultArray.sort((a: Result, b: Result) => {
                if (isRoomResult(a) || isRoomResult(b)) {
                    // Room results should appear at the top of the list
                    if (!isRoomResult(b)) return -1;
                    if (!isRoomResult(a)) return -1;

                    return recentAlgorithm.getLastTs(b.room, myUserId) - recentAlgorithm.getLastTs(a.room, myUserId);
                } else if (isMemberResult(a) || isMemberResult(b)) {
                    // Member results should appear just after room results
                    if (!isMemberResult(b)) return -1;
                    if (!isMemberResult(a)) return -1;

                    return memberComparator(a.member, b.member);
                }
                return 0;
            });
        }

        return results;
    }, [trimmedQuery, filter, cli, possibleResults, userDirectorySearchResults, memberComparator]);

    const numResults = sum(Object.values(results).map((it) => it.length));
    useWebSearchMetrics(numResults, query.length, true);

    const activeSpace = SpaceStore.instance.activeSpaceRoom;
    const [spaceResults, spaceResultsLoading] = useSpaceResults(activeSpace ?? undefined, query);

    const setQuery = (e: ChangeEvent<HTMLInputElement>): void => {
        const newQuery = transformSearchTerm(e.currentTarget.value);
        _setQuery(newQuery);
    };
    useEffect(() => {
        setTimeout(() => {
            const node = rovingContext.state.nodes[0];
            if (node) {
                rovingContext.dispatch({
                    type: RovingStateActionType.SetFocus,
                    payload: { node },
                });
                node?.scrollIntoView?.({
                    block: "nearest",
                });
            }
        });
        // we intentionally ignore changes to the rovingContext for the purpose of this hook
        // we only want to reset the focus whenever the results or filters change
        // eslint-disable-next-line
    }, [results, filter]);

    const viewRoom = (
        room: {
            roomId: string;
            roomAlias?: string;
            autoJoin?: boolean;
            shouldPeek?: boolean;
            viaServers?: string[];
            joinRule?: IPublicRoomsChunkRoom["join_rule"];
        },
        persist = false,
        viaKeyboard = false,
    ): void => {
        if (persist) {
            const recents = new Set(SettingsStore.getValue("SpotlightSearch.recentSearches", null).reverse());
            // remove & add the room to put it at the end
            recents.delete(room.roomId);
            recents.add(room.roomId);

            SettingsStore.setValue(
                "SpotlightSearch.recentSearches",
                null,
                SettingLevel.ACCOUNT,
                Array.from(recents).reverse().slice(0, MAX_RECENT_SEARCHES),
            );
        }

        defaultDispatcher.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            metricsTrigger: "WebUnifiedSearch",
            metricsViaKeyboard: viaKeyboard,
            room_id: room.roomId,
            room_alias: room.roomAlias,
            auto_join: room.autoJoin && !canAskToJoin(room.joinRule),
            should_peek: room.shouldPeek,
            via_servers: room.viaServers,
        });

        if (canAskToJoin(room.joinRule)) {
            defaultDispatcher.dispatch({ action: Action.PromptAskToJoin });
        }

        onFinished();
    };

    const confirmPayment = async (): Promise<void> => {
        if (!payingRoom) return;
        try {
            await joinByKeyword(payingRoom.keyword);
            const roomId = payingRoom.room_id;
            setPayingRoom(null);
            viewRoom({ roomId }, true);
        } catch {
            // erro já logado dentro do hook; aqui só fechamos o modal
            setPayingRoom(null);
        }
    };

    const confirmBundlePayment = async (): Promise<void> => {
        if (!payingBundle) return;
        try {
            await inviteBundle(MatrixClientPeg.safeGet(), payingBundle.bundle_id);
            const firstRoomId = payingBundle.rooms[0]?.room_id;
            setPayingBundle(null);
            if (firstRoomId) viewRoom({ roomId: firstRoomId }, true);
        } catch {
            // erro já logado dentro do bundleApi; aqui só fechamos o modal
            setPayingBundle(null);
        }
    };

    let otherSearchesSection: JSX.Element | undefined;
    if (trimmedQuery || (filter !== Filter.PublicRooms && filter !== Filter.PublicSpaces)) {
        otherSearchesSection = (
            <div
                className="mx_SpotlightDialog_section mx_SpotlightDialog_otherSearches"
                role="group"
                aria-labelledby="mx_SpotlightDialog_section_otherSearches"
            >
                <h4 id="mx_SpotlightDialog_section_otherSearches">
                    {trimmedQuery
                        ? _t("spotlight_dialog|heading_with_query", { query })
                        : _t("spotlight_dialog|heading_without_query")}
                </h4>
                <div>
                    {filter !== Filter.PublicSpaces && supportsSpaceFiltering && (
                        <Option
                            id="mx_SpotlightDialog_button_explorePublicSpaces"
                            onClick={() => setFilter(Filter.PublicSpaces)}
                        >
                            {filterToIcon(Filter.PublicSpaces)}
                            {filterToLabel(Filter.PublicSpaces)}
                        </Option>
                    )}
                   {filter !== Filter.PublicRooms && (
                        <Option
                            id="mx_SpotlightDialog_button_explorePublicRooms"
                            onClick={() => setFilter(Filter.PublicRooms)}
                        >
                            {filterToIcon(Filter.PublicRooms)}
                            {filterToLabel(Filter.PublicRooms)}
                        </Option>
                    )}
                    {filter !== Filter.Bundles && (
                        <Option
                            id="mx_SpotlightDialog_button_exploreBundles"
                            onClick={() => setFilter(Filter.Bundles)}
                        >
                            {filterToIcon(Filter.Bundles)}
                            {filterToLabel(Filter.Bundles)}
                        </Option>
                    )}
                    {filter !== Filter.People && (
                        <Option id="mx_SpotlightDialog_button_startChat" onClick={() => setFilter(Filter.People)}>
                            {filterToIcon(Filter.People)}
                            {filterToLabel(Filter.People)}
                        </Option>
                    )}
                    {filter === null && (
                        <Option
                            id="mx_SpotlightDialog_button_searchMessages"
                            onClick={() => {
                                defaultDispatcher.dispatch({
                                    action: Action.FocusMessageSearch,
                                    initialText: trimmedQuery,
                                });
                                onFinished();
                            }}
                        >
                            <ChatIcon />
                            {_t("spotlight_dialog|messages_label")}
                        </Option>
                    )}
                </div>
            </div>
        );
    }

    let content: JSX.Element;
    if (trimmedQuery || filter !== null) {
        const resultMapper = (result: Result): JSX.Element => {
            if (isDiscoverRoomResult(result)) {
                const room = result.discoverRoom;
                const isPaid = Number(room.price) > 0;
                const buttonLabel = isPaid ? 
                "Pagar" : "Entrar";

                const onAction = (ev: ButtonEvent): void => {
                    ev.stopPropagation();
                    if (isPaid) {
                        setPayingRoom(room); // abre o popup de confirmação
                        return;
                    }
                    // sala livre: navega/junta na sala
                    viewRoom(
                        {
                            roomId: room.room_id,
                            autoJoin: true,
                        },
                        true,
                        ev.type !== "click",
                    );
                };

                return (
                    <Option
                        id={`mx_SpotlightDialog_button_result_${room.room_id}`}
                        className="mx_SpotlightDialog_result_multiline"
                        key={`${Section[result.section]}-${room.room_id}`}
                        onClick={onAction}
                        endAdornment={
                            <AccessibleButton kind={isPaid ? "primary" : "primary_outline"} onClick={onAction} tabIndex={-1}>
                                {buttonLabel}
                            </AccessibleButton>
                        }
                    >
                        <RoomAvatar
                            className="mx_SearchResultAvatar"
                            oobData={{ roomId: room.room_id, name: room.name }}
                            size={AVATAR_SIZE}
                        />
                        <div className="mx_SpotlightDialog_result_multiline_text">
                            <span className="mx_SpotlightDialog_result_multiline_name">{room.name}</span>
                            <div className="mx_SpotlightDialog_result_details">
                                {room.member_count} {room.member_count === 1 ? "membro" : "membros"}
                                {isPaid ? ` · R$ ${(room.price / 100).toFixed(2)}` : " · Grátis"}
                            </div>
                        </div>
                    </Option>
                );
            }
            if (isBundleResult(result)) {
                const bundle = result.bundle;
                const isPaid = Number(bundle.price) > 0;
                const buttonLabel = isPaid ? "Pagar" : "Entrar";

                const onAction = async (ev: ButtonEvent): Promise<void> => {
                    ev.stopPropagation();
                    if (isPaid) {
                        setPayingBundle(bundle); // abre o popup de confirmação
                        return;
                    }
                    // bundle gratuito: entra direto em todas as salas
                    try {
                        await inviteBundle(cli, bundle.bundle_id);
                        const firstRoomId = bundle.rooms[0]?.room_id;
                        if (firstRoomId) viewRoom({ roomId: firstRoomId }, true, ev.type !== "click");
                    } catch {
                        // erro já logado dentro do bundleApi
                    }
                };

                return (
                    <Option
                        id={`mx_SpotlightDialog_button_result_${bundle.bundle_id}`}
                        className="mx_SpotlightDialog_result_multiline"
                        key={`${Section[result.section]}-${bundle.bundle_id}`}
                        onClick={onAction}
                        endAdornment={
                            <AccessibleButton
                                kind={isPaid ? "primary" : "primary_outline"}
                                onClick={onAction}
                                tabIndex={-1}
                            >
                                {buttonLabel}
                            </AccessibleButton>
                        }
                    >
                        <RoomAvatar
                            className="mx_SearchResultAvatar"
                            oobData={{ roomId: bundle.bundle_id, name: bundle.bundle_name }}
                            size={AVATAR_SIZE}
                        />
                        <div className="mx_SpotlightDialog_result_multiline_text">
                            <span className="mx_SpotlightDialog_result_multiline_name">{bundle.bundle_name}</span>
                            <div className="mx_SpotlightDialog_result_details">
                                {bundle.rooms.length} {bundle.rooms.length === 1 ? "sala" : "salas"}
                                {isPaid ? ` · R$ ${(bundle.price / 100).toFixed(2)}` : " · Grátis"}
                            </div>
                        </div>
                    </Option>
                );
            }
            if (isRoomResult(result)) {
                const notification = RoomNotificationStateStore.instance.getRoomState(result.room);
                const unreadLabel = roomAriaUnreadLabel(result.room, notification);
                const ariaProperties = {
                    "aria-label": unreadLabel ? `${result.room.name} ${unreadLabel}` : result.room.name,
                    "aria-describedby": `mx_SpotlightDialog_button_result_${result.room.roomId}_details`,
                };
                return (
                    <Option
                        id={`mx_SpotlightDialog_button_result_${result.room.roomId}`}
                        key={`${Section[result.section]}-${result.room.roomId}`}
                        onClick={(ev) => {
                            viewRoom({ roomId: result.room.roomId }, true, ev?.type !== "click");
                        }}
                        endAdornment={<RoomResultContextMenus room={result.room} />}
                        {...ariaProperties}
                    >
                        <DecoratedRoomAvatar room={result.room} size={AVATAR_SIZE} tooltipProps={{ tabIndex: -1 }} />
                        {result.room.name}
                        <NotificationBadge notification={notification} />
                        <RoomContextDetails
                            id={`mx_SpotlightDialog_button_result_${result.room.roomId}_details`}
                            className="mx_SpotlightDialog_result_details"
                            room={result.room}
                        />
                    </Option>
                );
            }
            if (isMemberResult(result)) {
                return (
                    <Option
                        id={`mx_SpotlightDialog_button_result_${result.member.userId}`}
                        key={`${Section[result.section]}-${result.member.userId}`}
                        onClick={() => {
                            startDmOnFirstMessage(cli, [result.member]);
                            onFinished();
                        }}
                        aria-label={
                            result.member instanceof RoomMember ? result.member.rawDisplayName : result.member.name
                        }
                        aria-describedby={`mx_SpotlightDialog_button_result_${result.member.userId}_details`}
                    >
                        <SearchResultAvatar user={result.member} size={AVATAR_SIZE} />
                        {result.member instanceof RoomMember ? result.member.rawDisplayName : result.member.name}
                        <div
                            id={`mx_SpotlightDialog_button_result_${result.member.userId}_details`}
                            className="mx_SpotlightDialog_result_details"
                        >
                            {result.member.userId}
                        </div>
                    </Option>
                );
            }
            if (isPublicRoomResult(result)) {
                const clientRoom = cli.getRoom(result.publicRoom.room_id);
                const joinRule = result.publicRoom.join_rule;
                // Element Web currently does not allow guests to join rooms, so we
                // instead show them view buttons for all rooms. If the room is not
                // world readable, a modal will appear asking you to register first. If
                // it is readable, the preview appears as normal.
                const showViewButton =
                    clientRoom?.getMyMembership() === KnownMembership.Join ||
                    (result.publicRoom.world_readable && !canAskToJoin(joinRule)) ||
                    cli.isGuest();

                const listener = (ev: ButtonEvent): void => {
                    ev.stopPropagation();

                    const { publicRoom } = result;
                    viewRoom(
                        {
                            roomAlias: publicRoom.canonical_alias || publicRoom.aliases?.[0],
                            roomId: publicRoom.room_id,
                            autoJoin: !result.publicRoom.world_readable && !cli.isGuest(),
                            shouldPeek: result.publicRoom.world_readable || cli.isGuest(),
                            viaServers: config ? [config.roomServer] : undefined,
                            joinRule,
                        },
                        true,
                        ev.type !== "click",
                    );
                };

                let buttonLabel;
                if (showViewButton) {
                    buttonLabel = _t("action|view");
                } else {
                    buttonLabel = canAskToJoin(joinRule) ? _t("action|ask_to_join") : _t("action|join");
                }

                return (
                    <Option
                        id={`mx_SpotlightDialog_button_result_${result.publicRoom.room_id}`}
                        className="mx_SpotlightDialog_result_multiline"
                        key={`${Section[result.section]}-${result.publicRoom.room_id}`}
                        onClick={listener}
                        endAdornment={
                            <AccessibleButton
                                kind={showViewButton ? "primary_outline" : "primary"}
                                onClick={listener}
                                tabIndex={-1}
                            >
                                {buttonLabel}
                            </AccessibleButton>
                        }
                        aria-labelledby={`mx_SpotlightDialog_button_result_${result.publicRoom.room_id}_name`}
                        aria-describedby={`mx_SpotlightDialog_button_result_${result.publicRoom.room_id}_alias`}
                        aria-details={`mx_SpotlightDialog_button_result_${result.publicRoom.room_id}_details`}
                    >
                        <RoomAvatar
                            className="mx_SearchResultAvatar"
                            oobData={{
                                roomId: result.publicRoom.room_id,
                                name: result.publicRoom.name,
                                avatarUrl: result.publicRoom.avatar_url,
                                roomType: result.publicRoom.room_type,
                            }}
                            size={AVATAR_SIZE}
                        />
                        <PublicRoomResultDetails
                            room={result.publicRoom}
                            labelId={`mx_SpotlightDialog_button_result_${result.publicRoom.room_id}_name`}
                            descriptionId={`mx_SpotlightDialog_button_result_${result.publicRoom.room_id}_alias`}
                            detailsId={`mx_SpotlightDialog_button_result_${result.publicRoom.room_id}_details`}
                        />
                    </Option>
                );
            }

            // IResult case
            return (
                <Option
                    id={`mx_SpotlightDialog_button_result_${result.name}`}
                    key={`${Section[result.section]}-${result.name}`}
                    onClick={result.onClick ?? null}
                >
                    {result.avatar}
                    {result.name}
                    {result.description}
                </Option>
            );
        };

        let peopleSection: JSX.Element | undefined;
        if (results[Section.People].length) {
            peopleSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_results"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_people"
                >
                    <h4 id="mx_SpotlightDialog_section_people">{_t("invite|recents_section")}</h4>
                    <div>{results[Section.People].slice(0, SECTION_LIMIT).map(resultMapper)}</div>
                </div>
            );
        }

        let suggestionsSection: JSX.Element | undefined;
        if (results[Section.Suggestions].length && filter === Filter.People) {
            suggestionsSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_results"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_suggestions"
                >
                    <h4 id="mx_SpotlightDialog_section_suggestions">{_t("common|suggestions")}</h4>
                    <div>{results[Section.Suggestions].slice(0, SECTION_LIMIT).map(resultMapper)}</div>
                </div>
            );
        }

        let roomsSection: JSX.Element | undefined;
        if (results[Section.Rooms].length) {
            roomsSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_results"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_rooms"
                >
                    <h4 id="mx_SpotlightDialog_section_rooms">{_t("common|rooms")}</h4>
                    <div>{results[Section.Rooms].slice(0, SECTION_LIMIT).map(resultMapper)}</div>
                </div>
            );
        }

        let spacesSection: JSX.Element | undefined;
        if (results[Section.Spaces].length) {
            spacesSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_results"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_spaces"
                >
                    <h4 id="mx_SpotlightDialog_section_spaces">{_t("spotlight_dialog|spaces_title")}</h4>
                    <div>{results[Section.Spaces].slice(0, SECTION_LIMIT).map(resultMapper)}</div>
                </div>
            );
        }

        let publicRoomsSection: JSX.Element | undefined;
        if (filter === Filter.PublicRooms || filter === Filter.PublicSpaces) {
            let content: JSX.Element | JSX.Element[];
            if (publicRoomsError || discoverError) {
                content = (
                    <div className="mx_SpotlightDialog_otherSearches_messageSearchText">
                        {filter === Filter.PublicRooms
                            ? _t("spotlight_dialog|failed_querying_public_rooms")
                            : _t("spotlight_dialog|failed_querying_public_spaces")}
                    </div>
                );
            } else {
                content = results[Section.PublicRoomsAndSpaces].slice(0, SECTION_LIMIT).map(resultMapper);
            }

            publicRoomsSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_results"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_publicRooms"
                >
                    <div className="mx_SpotlightDialog_sectionHeader">
                        <h4 id="mx_SpotlightDialog_section_publicRooms">{_t("common|suggestions")}</h4>
                        <div className="mx_SpotlightDialog_options">
                            <NetworkDropdown protocols={protocols} config={config ?? null} setConfig={setConfig} />
                        </div>
                    </div>
                    <div>{content}</div>
                </div>
            );
        }
         let discoverSpacesSection: JSX.Element | undefined;
        if (filter === Filter.PublicSpaces || (filter === Filter.PublicRooms && showSpacesChip)) {
            let content: JSX.Element | JSX.Element[];
            if (discoverError) {
                content = (
                    <div className="mx_SpotlightDialog_otherSearches_messageSearchText">
                        Não foi possível carregar os espaços.
                    </div>
                );
            } else if (!discoverLoading && results[Section.DiscoverSpaces].length === 0) {
                content = (
                    <div className="mx_SpotlightDialog_otherSearches_messageSearchText">
                        Nenhum espaço disponível no momento.
                    </div>
                );
            } else {
                content = results[Section.DiscoverSpaces].slice(0, SECTION_LIMIT).map(resultMapper);
            }
 
            discoverSpacesSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_results"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_discoverSpaces"
                >
                    <h4 id="mx_SpotlightDialog_section_discoverSpaces">
                        {filterToLabel(Filter.PublicSpaces)}
                    </h4>
                    <div>{content}</div>
                </div>
            );
        }
        let bundlesSection: JSX.Element | undefined;
        if (filter === Filter.Bundles || (filter === Filter.PublicRooms && showBundlesChip)) {
            let content: JSX.Element | JSX.Element[];
            if (bundlesError) {
                content = (
                    <div className="mx_SpotlightDialog_otherSearches_messageSearchText">
                        Não foi possível carregar os bundles.
                    </div>
                );
            } else if (!bundlesLoading && results[Section.Bundles].length === 0) {
                content = (
                    <div className="mx_SpotlightDialog_otherSearches_messageSearchText">
                        Nenhum bundle disponível no momento.
                    </div>
                );
            } else {
                content = results[Section.Bundles].slice(0, SECTION_LIMIT).map(resultMapper);
            }

            bundlesSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_results"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_bundles"
                >
                    <h4 id="mx_SpotlightDialog_section_bundles">Bundles</h4>
                    <div>{content}</div>
                </div>
            );
        }

        let spaceRoomsSection: JSX.Element | undefined;
        if (spaceResults.length && activeSpace && filter === null) {
            spaceRoomsSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_results"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_spaceRooms"
                >
                    <h4 id="mx_SpotlightDialog_section_spaceRooms">
                        {_t("spotlight_dialog|other_rooms_in_space", { spaceName: activeSpace.name })}
                    </h4>
                    <div>
                        {spaceResults.slice(0, SECTION_LIMIT).map(
                            (room: HierarchyRoom): JSX.Element => (
                                <Option
                                    id={`mx_SpotlightDialog_button_result_${room.room_id}`}
                                    key={room.room_id}
                                    onClick={(ev) => {
                                        viewRoom({ roomId: room.room_id }, true, ev?.type !== "click");
                                    }}
                                >
                                    <BaseAvatar
                                        name={room.name}
                                        idName={room.room_id}
                                        url={
                                            room.avatar_url
                                                ? mediaFromMxc(room.avatar_url).getSquareThumbnailHttp(
                                                      parseInt(AVATAR_SIZE, 10),
                                                  )
                                                : null
                                        }
                                        size={AVATAR_SIZE}
                                    />
                                    {room.name || room.canonical_alias}
                                    {room.name && room.canonical_alias && (
                                        <div className="mx_SpotlightDialog_result_details">{room.canonical_alias}</div>
                                    )}
                                </Option>
                            ),
                        )}
                        {spaceResultsLoading && <Spinner />}
                    </div>
                </div>
            );
        }

        let joinRoomSection: JSX.Element | undefined;
        if (
            trimmedQuery.startsWith("#") &&
            trimmedQuery.includes(":") &&
            (!getCachedRoomIdForAlias(trimmedQuery) || !cli.getRoom(getCachedRoomIdForAlias(trimmedQuery)!.roomId))
        ) {
            joinRoomSection = (
                <div className="mx_SpotlightDialog_section mx_SpotlightDialog_otherSearches" role="group">
                    <div>
                        <Option
                            id="mx_SpotlightDialog_button_joinRoomAlias"
                            onClick={(ev) => {
                                defaultDispatcher.dispatch<ViewRoomPayload>({
                                    action: Action.ViewRoom,
                                    room_alias: trimmedQuery,
                                    auto_join: true,
                                    metricsTrigger: "WebUnifiedSearch",
                                    metricsViaKeyboard: ev?.type !== "click",
                                });
                                onFinished();
                            }}
                        >
                            <RoomIcon />
                            {_t("spotlight_dialog|join_button_text", {
                                roomAddress: trimmedQuery,
                            })}
                        </Option>
                    </div>
                </div>
            );
        }

        let hiddenResultsSection: JSX.Element | undefined;
        if (filter === Filter.People) {
            hiddenResultsSection = (
                <div className="mx_SpotlightDialog_section mx_SpotlightDialog_hiddenResults" role="group">
                    <h4>{_t("spotlight_dialog|result_may_be_hidden_privacy_warning")}</h4>
                    <div className="mx_SpotlightDialog_otherSearches_messageSearchText">
                        {_t("spotlight_dialog|cant_find_person_helpful_hint")}
                    </div>
                    <TooltipOption
                        id="mx_SpotlightDialog_button_inviteLink"
                        className="mx_SpotlightDialog_inviteLink"
                        onClick={() => {
                            setInviteLinkCopied(true);
                            copyPlaintext(ownInviteLink);
                        }}
                        onTooltipOpenChange={(open) => {
                            if (!open) setInviteLinkCopied(false);
                        }}
                        title={inviteLinkCopied ? _t("common|copied") : _t("action|copy")}
                    >
                        <span className="mx_AccessibleButton mx_AccessibleButton_hasKind mx_AccessibleButton_kind_primary_outline">
                            <LinkIcon />
                            {_t("spotlight_dialog|copy_link_text")}
                        </span>
                    </TooltipOption>
                </div>
            );
        } else if (trimmedQuery && (filter === Filter.PublicRooms || filter === Filter.PublicSpaces)) {
            hiddenResultsSection = (
                <div className="mx_SpotlightDialog_section mx_SpotlightDialog_hiddenResults" role="group">
                    <h4>{_t("spotlight_dialog|result_may_be_hidden_warning")}</h4>
                    {/* <div className="mx_SpotlightDialog_otherSearches_messageSearchText">
                        {_t("spotlight_dialog|cant_find_room_helpful_hint")}
                    </div>
                    <Option
                        id="mx_SpotlightDialog_button_createNewRoom"
                        className="mx_SpotlightDialog_createRoom"
                        onClick={() =>
                            defaultDispatcher.dispatch({
                                action: Action.CreateRoom,
                                public: true,
                                defaultName: capitalize(trimmedQuery),
                            })
                        }
                    >
                        <span className="mx_AccessibleButton mx_AccessibleButton_hasKind mx_AccessibleButton_kind_primary_outline">
                            <RoomIcon />
                            {_t("spotlight_dialog|create_new_room_button")}
                        </span>
                    </Option> */}
                </div>
            );
        }

        // let groupChatSection: JSX.Element | undefined;
        // if (filter === Filter.People) {
        //     groupChatSection = (
        //         <div
        //             className="mx_SpotlightDialog_section mx_SpotlightDialog_otherSearches"
        //             role="group"
        //             aria-labelledby="mx_SpotlightDialog_section_groupChat"
        //         >
        //             <h4 id="mx_SpotlightDialog_section_groupChat">{_t("spotlight_dialog|group_chat_section_title")}</h4>
        //             <Option
        //                 id="mx_SpotlightDialog_button_startGroupChat"
        //                 onClick={() => showStartChatInviteDialog(trimmedQuery)}
        //             >
        //                 <GroupIcon />
        //                 {_t("spotlight_dialog|start_group_chat_button")}
        //             </Option>
        //         </div>
        //     );
        // }

        content = (
            <>
                {peopleSection}
                {suggestionsSection}
                {roomsSection}
                {spacesSection}
                {spaceRoomsSection}
                {discoverSpacesSection}
                {bundlesSection}
                {publicRoomsSection}
                {joinRoomSection}
            </>
        );
    } else {
        let recentSearchesSection: JSX.Element | undefined;
        if (recentSearches.length) {
            recentSearchesSection = (
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_recentSearches"
                    role="group"
                    // Firefox sometimes makes this element focusable due to overflow,
                    // so force it out of tab order by default.
                    tabIndex={-1}
                    aria-labelledby="mx_SpotlightDialog_section_recentSearches"
                >
                    <h4>
                        <span id="mx_SpotlightDialog_section_recentSearches">
                            {_t("spotlight_dialog|recent_searches_section_title")}
                        </span>
                        <AccessibleButton kind="link" onClick={clearRecentSearches}>
                            {_t("action|clear")}
                        </AccessibleButton>
                    </h4>
                    <div>
                        {recentSearches.map((room) => {
                            const notification = RoomNotificationStateStore.instance.getRoomState(room);
                            const unreadLabel = roomAriaUnreadLabel(room, notification);
                            const ariaProperties = {
                                "aria-label": unreadLabel ? `${room.name} ${unreadLabel}` : room.name,
                                "aria-describedby": `mx_SpotlightDialog_button_recentSearch_${room.roomId}_details`,
                            };
                            return (
                                <Option
                                    id={`mx_SpotlightDialog_button_recentSearch_${room.roomId}`}
                                    key={room.roomId}
                                    onClick={(ev) => {
                                        viewRoom({ roomId: room.roomId }, true, ev?.type !== "click");
                                    }}
                                    endAdornment={<RoomResultContextMenus room={room} />}
                                    {...ariaProperties}
                                >
                                    <DecoratedRoomAvatar
                                        room={room}
                                        size={AVATAR_SIZE}
                                        tooltipProps={{ tabIndex: -1 }}
                                    />
                                    {room.name}
                                    <NotificationBadge notification={notification} />
                                    <RoomContextDetails
                                        id={`mx_SpotlightDialog_button_recentSearch_${room.roomId}_details`}
                                        className="mx_SpotlightDialog_result_details"
                                        room={room}
                                    />
                                </Option>
                            );
                        })}
                    </div>
                </div>
            );
        }

        content = (
            <>
                <div
                    className="mx_SpotlightDialog_section mx_SpotlightDialog_recentlyViewed"
                    role="group"
                    aria-labelledby="mx_SpotlightDialog_section_recentlyViewed"
                >
                    <h4 id="mx_SpotlightDialog_section_recentlyViewed">
                        {_t("spotlight_dialog|recently_viewed_section_title")}
                    </h4>
                    <div>
                        {BreadcrumbsStore.instance.rooms
                            .filter((r) => r.roomId !== SdkContextClass.instance.roomViewStore.getRoomId())
                            .map((room) => (
                                <TooltipOption
                                    id={`mx_SpotlightDialog_button_recentlyViewed_${room.roomId}`}
                                    title={room.name}
                                    key={room.roomId}
                                    onClick={(ev) => {
                                        viewRoom({ roomId: room.roomId }, false, ev.type !== "click");
                                    }}
                                >
                                    <DecoratedRoomAvatar room={room} size="32px" tooltipProps={{ tabIndex: -1 }} />
                                    {room.name}
                                </TooltipOption>
                            ))}
                    </div>
                </div>

                {recentSearchesSection}
                {otherSearchesSection}
            </>
        );
    }

    const onDialogKeyDown = (ev: KeyboardEvent | React.KeyboardEvent): void => {
        const navigationAction = getKeyBindingsManager().getNavigationAction(ev);
        switch (navigationAction) {
            case KeyBindingAction.FilterRooms:
                ev.stopPropagation();
                ev.preventDefault();
                onFinished();
                break;
        }

        let node: HTMLElement | undefined;
        const accessibilityAction = getKeyBindingsManager().getAccessibilityAction(ev);
        switch (accessibilityAction) {
            case KeyBindingAction.Escape:
                ev.stopPropagation();
                ev.preventDefault();
                onFinished();
                break;
            case KeyBindingAction.ArrowUp:
            case KeyBindingAction.ArrowDown:
                ev.stopPropagation();
                ev.preventDefault();

                if (rovingContext.state.activeNode && rovingContext.state.nodes.length > 0) {
                    let nodes = rovingContext.state.nodes;
                    if (!query && filter === null) {
                        // If the current selection is not in the recently viewed row then only include the
                        // first recently viewed so that is the target when the user is switching into recently viewed.
                        const keptRecentlyViewedRef = nodeIsForRecentlyViewed(rovingContext.state.activeNode)
                            ? rovingContext.state.activeNode
                            : nodes.find(nodeIsForRecentlyViewed);
                        // exclude all other recently viewed items from the list so up/down arrows skip them
                        nodes = nodes.filter((ref) => ref === keptRecentlyViewedRef || !nodeIsForRecentlyViewed(ref));
                    }

                    const idx = nodes.indexOf(rovingContext.state.activeNode);
                    node = findNextSiblingElement(
                        nodes,
                        idx + (accessibilityAction === KeyBindingAction.ArrowUp ? -1 : 1),
                    );
                }
                break;

            case KeyBindingAction.ArrowLeft:
            case KeyBindingAction.ArrowRight:
                // only handle these keys when we are in the recently viewed row of options
                if (
                    !query &&
                    filter === null &&
                    rovingContext.state.activeNode &&
                    rovingContext.state.nodes.length > 0 &&
                    nodeIsForRecentlyViewed(rovingContext.state.activeNode)
                ) {
                    // we only intercept left/right arrows when the field is empty, and they'd do nothing anyway
                    ev.stopPropagation();
                    ev.preventDefault();

                    const nodes = rovingContext.state.nodes.filter(nodeIsForRecentlyViewed);
                    const idx = nodes.indexOf(rovingContext.state.activeNode);
                    node = findNextSiblingElement(
                        nodes,
                        idx + (accessibilityAction === KeyBindingAction.ArrowLeft ? -1 : 1),
                    );
                }
                break;
        }

        if (node) {
            rovingContext.dispatch({
                type: RovingStateActionType.SetFocus,
                payload: { node },
            });
            node?.scrollIntoView({
                block: "nearest",
            });
        }
    };

    const onKeyDown = (ev: React.KeyboardEvent): void => {
        const action = getKeyBindingsManager().getAccessibilityAction(ev);

        switch (action) {
            case KeyBindingAction.Backspace:
                if (!query && filter !== null) {
                    ev.stopPropagation();
                    ev.preventDefault();
                    setFilter(null);
                }
                break;
            case KeyBindingAction.Enter:
                ev.stopPropagation();
                ev.preventDefault();
                rovingContext.state.activeNode?.click();
                break;
        }
    };

    const activeDescendant = rovingContext.state.activeNode?.id;

    const paymentModal = payingRoom ? (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5000,
            }}
            onClick={() => setPayingRoom(null)}
        >
            <div
                style={{
                    background: "var(--cpd-color-bg-canvas-default, #fff)",
                    color: "var(--cpd-color-text-primary, #000)",
                    padding: "24px",
                    borderRadius: "8px",
                    minWidth: "280px",
                    maxWidth: "90vw",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{ marginTop: 0 }}>Confirmar pagamento?</h3>
                <p>
                    Sala: <strong>{payingRoom.name}</strong>
                    <br />
                    Valor: <strong>R$ {(payingRoom.price / 100).toFixed(2)}</strong>
                </p>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
                    <AccessibleButton kind="secondary" onClick={() => setPayingRoom(null)}>
                        Cancelar
                    </AccessibleButton>
                    <AccessibleButton kind="primary" onClick={confirmPayment}>
                        Pagar
                    </AccessibleButton>
                </div>
            </div>
        </div>
    ) : null;

    const bundlePaymentModal = payingBundle ? (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5000,
            }}
            onClick={() => setPayingBundle(null)}
        >
            <div
                style={{
                    background: "var(--cpd-color-bg-canvas-default, #fff)",
                    color: "var(--cpd-color-text-primary, #000)",
                    padding: "24px",
                    borderRadius: "8px",
                    minWidth: "280px",
                    maxWidth: "90vw",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{ marginTop: 0 }}>Confirmar pagamento?</h3>
                <p>
                    Bundle: <strong>{payingBundle.bundle_name}</strong>
                    <br />
                    {payingBundle.rooms.length} sala(s) incluída(s)
                    <br />
                    Valor: <strong>R$ {(payingBundle.price / 100).toFixed(2)}</strong>
                </p>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
                    <AccessibleButton kind="secondary" onClick={() => setPayingBundle(null)}>
                        Cancelar
                    </AccessibleButton>
                    <AccessibleButton kind="primary" onClick={confirmBundlePayment}>
                        Pagar
                    </AccessibleButton>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <>
            {paymentModal}
            {bundlePaymentModal}
            <div id="mx_SpotlightDialog_keyboardPrompt">
                {_t(
                    "spotlight_dialog|keyboard_scroll_hint",
                    {},
                    {
                        arrows: () => (
                            <>
                                <kbd>↓</kbd>
                                <kbd>↑</kbd>
                                {filter === null && !query && <kbd>←</kbd>}
                                {filter === null && !query && <kbd>→</kbd>}
                            </>
                        ),
                    },
                )}
            </div>

            <BaseDialog
                className="mx_SpotlightDialog"
                onFinished={onFinished}
                hasCancel={false}
                onKeyDown={onDialogKeyDown}
                screenName="UnifiedSearch"
                aria-label={_t("spotlight_dialog|search_dialog")}
            >
                <div className="mx_SpotlightDialog_searchBox mx_textinput">
                    {filter === Filter.PublicRooms && showBundlesChip && (
                        <div className="mx_SpotlightDialog_filter">
                            {filterToIcon(Filter.Bundles)}
                            <span>{filterToLabel(Filter.Bundles)}</span>
                            <AccessibleButton
                                tabIndex={-1}
                                title={_t("spotlight_dialog|remove_filter", {
                                    filter: filterToLabel(Filter.Bundles),
                                })}
                                className="mx_SpotlightDialog_filter--close"
                                onClick={() => setShowBundlesChip(false)}
                            >
                                <CloseIcon />
                            </AccessibleButton>
                        </div>
                    )}
                                        {filter === Filter.PublicRooms && showSpacesChip && (
                        <div className="mx_SpotlightDialog_filter">
                            {filterToIcon(Filter.PublicSpaces)}
                            <span>{filterToLabel(Filter.PublicSpaces)}</span>
                            <AccessibleButton
                                tabIndex={-1}
                                title={_t("spotlight_dialog|remove_filter", {
                                    filter: filterToLabel(Filter.PublicSpaces),
                                })}
                                className="mx_SpotlightDialog_filter--close"
                                onClick={() => setShowSpacesChip(false)}
                            >
                                <CloseIcon />
                            </AccessibleButton>
                        </div>
                    )}
                    {filter !== null && (
                        <div className="mx_SpotlightDialog_filter">
                            {filterToIcon(filter)}
                            <span>{filterToLabel(filter)}</span>
                            <AccessibleButton
                                tabIndex={-1}
                                title={_t("spotlight_dialog|remove_filter", {
                                    filter: filterToLabel(filter),
                                })}
                                className="mx_SpotlightDialog_filter--close"
                                onClick={() => setFilter(null)}
                            >
                                <CloseIcon />
                            </AccessibleButton>
                        </div>
                    )}
                    <input
                        ref={inputRef}
                        autoFocus
                        type="text"
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck="false"
                        placeholder={_t("action|search")}
                        value={query}
                        onChange={setQuery}
                        onKeyDown={onKeyDown}
                        aria-owns="mx_SpotlightDialog_content"
                        aria-activedescendant={activeDescendant}
                        aria-label={_t("action|search")}
                        aria-describedby="mx_SpotlightDialog_keyboardPrompt"
                    />
                    {(publicRoomsLoading || peopleLoading || profileLoading || discoverLoading) && <Spinner size={24} />}
                </div>

                <div
                    ref={scrollContainerRef}
                    id="mx_SpotlightDialog_content"
                    role="listbox"
                    aria-activedescendant={activeDescendant}
                    aria-describedby="mx_SpotlightDialog_keyboardPrompt"
                >
                    {content}
                </div>
            </BaseDialog>
        </>
    );
};

const RovingSpotlightDialog: React.FC<IProps> = (props) => {
    return <RovingTabIndexProvider>{() => <SpotlightDialog {...props} />}</RovingTabIndexProvider>;
};

export default RovingSpotlightDialog;
