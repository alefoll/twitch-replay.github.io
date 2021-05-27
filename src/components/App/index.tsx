import React from "react";

import { Calendar } from "@components/Calendar";
import { Video, VideoApiModel, VideoModel } from "@components/Video";
import { UserModel, UserProps } from "@components/User";
import { Login } from "@components/Login";
import { Sidebar } from "@components/Sidebar";

import "./style.css";

import "../../../assets/TwitchExtrudedWordmarkPurple.svg";

export interface AppState {
    token: string | undefined,

    me: UserModel,
    users: UserProps[];
}

interface UserFollow {
    followed_at: string;
    from_id: string;
    from_name: string;
    to_id: string;
    to_name: string;
}

export class App extends React.PureComponent<{}, AppState> {
    static readonly clientID = "gvmbg22kqruvfibmxm4dm5datn9yis";

    constructor(props: {}) {
        super(props);

        let token = window.localStorage.getItem("token");

        if (window.location.hash.length) {
            const hash = window.location.hash.slice(1);

            const hashParsed = hash.split("&").reduce((previous: any, current) => {
                const key = current.split("=")[0];
                const value = current.split("=")[1];

                previous[key] = value;

                return previous;
            }, {});

            if (hashParsed.access_token != null) {
                token = hashParsed.access_token;

                window.localStorage.setItem("token", hashParsed.access_token);
            }

            window.location.hash = "";
        }

        if (token) {
            this.state = {
                ...this.state,
                token: token
            };

            this.init();
        }
    }

    private api = async (path: string) => {
        try {
            const request = await fetch(`https://api.twitch.tv/helix/${ path }`, {
                headers: {
                    "Authorization" : `Bearer ${ this.state.token }`,
                    "Client-Id"     : App.clientID,
                }
            });

            if (request.status < 200 || request.status > 299) {
                throw "Request error";
            }

            return request.json();
        } catch (error) {
            if (error === "Request error") {
                window.localStorage.removeItem("token");

                this.setState({
                    token: undefined
                });
            }
        }
    }

    private readonly init = async () => {
        const me = (await this.getUsers())[0];

        this.setState({ me });

        const userFollow = await this.getUserChannels(me);

        const userIDs = userFollow.map(follow => follow.to_id);

        const users = await this.getUsers(userIDs);

        users.sort((a, b) => a.display_name.toLocaleLowerCase().localeCompare(b.display_name.toLocaleLowerCase()));

        const defaultColors = [
            "#9147ff",
            "#fa1fd1",
            "#8205b5",
            "#00c7b0",
            "#1f69ff",
            "#fab5ff",
            "#fa2929",
            "#57bee6",
            "#bf0078",
            "#fc6675",
            "#40145e",
            "#ff6905",
            "#bfabff",
            "#ffc95e",
            "#0014a6",
        ]

        const colors: { login: string, color: string }[] = require("../../../assets/colors.json");

        const colorUsers = users.map((user) => {
            const userProps: UserProps = {
                ...user,
                color: colors.find((_) => _.login === user.login)?.color ?? defaultColors[Math.floor(defaultColors.length * Math.random())],
            }

            return userProps;
        });

        this.setState({ users: colorUsers });

        colorUsers.map(async (user) => {
            const { videos, pagination: video_pagination } = await this.getVideos(user);

            const stateUsers = [...this.state.users];

            const stateUser = stateUsers.find(stateUser => stateUser.id === user.id);

            if (stateUser) {
                stateUser.videos = stateUser.videos || [];
                stateUser.videos.push(...videos);

                stateUser.video_pagination = video_pagination;

                this.setState({ users: stateUsers });
            }
        });

        const streams = await this.getStreams(userIDs);

        streams.map((stream) => {
            const stateUsers = [...this.state.users];

            const stateUser = stateUsers.find(stateUser => stateUser.id === stream.user_id);

            if (stateUser) {
                stateUser.isLive = true;
                stateUser.videos = stateUser.videos || [];

                stateUser.videos.push({
                    ...stream,
                    url: `https://www.twitch.tv/${ stateUser.login }`
                });

                this.setState({ users: stateUsers });
            }
        });
    }

    private readonly getStreams = async (userIDs: string[], pagination: string = ""): Promise<VideoModel[]> => {
        const request = await this.api(`streams?user_id=${ userIDs.slice(0, 100).join("&user_id=") }&after=${ pagination }`);

        const streams: VideoApiModel[] = request.data;

        if (request.pagination.cursor) {
            const recursive = await this.getStreams(userIDs.slice(100, 200), request.pagination.cursor);

            streams.push(...recursive);
        }

        return streams.map((stream) => {
            const start_in_seconds    = Video.dateToSeconds(stream.started_at!);
            const duration_in_seconds = Video.durationToNow(stream.started_at!);
            const end_in_seconds      = start_in_seconds + duration_in_seconds;

            return {
                ...stream,
                created_at: stream.started_at!,
                start_in_seconds,
                duration_in_seconds,
                end_in_seconds,
            };
        });
    }

    private readonly getUsers = async (userIDs: string[] = []): Promise<UserModel[]> => {
        let query = "";


        if (userIDs.length) {
            query = "?id=" + userIDs.slice(0, 100).join("&id="); // API limit 100
        }

        const request = await this.api(`users${ query }`);

        return request.data;
    }

    private readonly getUserChannels = async (user: UserModel, pagination: string = ""): Promise<UserFollow[]> => {
        const request = await this.api(`users/follows?from_id=${ user.id }&after=${ pagination }`);

        const result = request.data;

        if (request.pagination.cursor) {
            const recursive = await this.getUserChannels(user, request.pagination.cursor);

            result.push(...recursive);
        }

        return result;
    }

    private readonly getVideos = async (user: UserProps, pagination: string = ""): Promise<{ videos: VideoModel[], pagination: string }> => {
        const request = await this.api(`videos?user_id=${ user.id }&after=${ pagination }&first=100`);

        let data: VideoApiModel[] = request.data;

        data = data.filter((video) => video.thumbnail_url !== "" && video.type !== "highlight");

        const videos: VideoModel[] = data.map((video) => {
            const start_in_seconds    = Video.dateToSeconds(video.created_at);
            const duration_in_seconds = Video.durationToSeconds(video.duration!);
            const end_in_seconds      = start_in_seconds + duration_in_seconds;

            return {
                ...video,
                start_in_seconds,
                duration_in_seconds,
                end_in_seconds,
            }
        });

        return {
            videos,
            pagination: request.pagination,
        };
    }

    render() {
        if (!this.state?.token) {
            return <Login />;
        }

        return (
            <>
                <Sidebar users={ this.state?.users } />

                <main className="app">
                    <h1 className="app--title">Replay Calendar</h1>

                    <Calendar users={ this.state?.users } />
                </main>
            </>
        );
    }
}
