package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.repository.DemRasterRepository;
import com.ddemachim.server.domain.course.repository.DemRasterRepository.Coordinate;
import com.ddemachim.server.domain.course.repository.DemRasterRepository.ElevationSample;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.LineStringGeometry;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalDouble;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class ElevationProfileServiceTest {

    @Test
    void twelveMeterLineIsSampledAtZeroFiveTenAndItsFinalEndpointInOneDemBatch() {
        DemRasterRepository repository = mock(DemRasterRepository.class);
        List<List<Coordinate>> calls = new ArrayList<>();
        when(repository.findElevations(anyList())).thenAnswer(invocation -> {
            List<Coordinate> coordinates = List.copyOf(invocation.getArgument(0));
            calls.add(coordinates);
            List<ElevationSample> samples = new ArrayList<>();
            for (int index = 0; index < coordinates.size(); index++) {
                samples.add(new ElevationSample(
                        index, coordinates.get(index), OptionalDouble.of(20.0)));
            }
            return samples;
        });
        ElevationProfileService service = new ElevationProfileService(repository);

        ElevationProfileService.ProfileResult result = service.profile(new LineStringGeometry(List.of(
                List.of(126.0, 0.0),
                List.of(126.0001079186, 0.0))));

        assertThat(calls).hasSize(1);
        assertThat(calls.getFirst().get(0).longitude()).isCloseTo(126.0, within(1.0e-10));
        assertThat(calls.getFirst().get(1).longitude()).isCloseTo(126.0000449661, within(1.0e-10));
        assertThat(calls.getFirst().get(2).longitude()).isCloseTo(126.0000899322, within(1.0e-10));
        assertThat(calls.getFirst().get(3).longitude()).isCloseTo(126.0001079186, within(1.0e-10));
        assertThat(calls.getFirst())
                .extracting(Coordinate::latitude)
                .containsOnly(0.0);
        assertThat(result.profile()).hasSize(4);
        assertThat(result.profile().get(0).distanceMeters()).isCloseTo(0.0, within(1.0e-6));
        assertThat(result.profile().get(1).distanceMeters()).isCloseTo(5.0, within(1.0e-6));
        assertThat(result.profile().get(2).distanceMeters()).isCloseTo(10.0, within(1.0e-6));
        assertThat(result.profile().get(3).distanceMeters()).isCloseTo(12.0, within(1.0e-3));
    }

    @Test
    void continuousSubMeterStepsCountAsAscentAndExactlyEightPercentCountsAsSteep() {
        DemRasterRepository repository = repositoryWithElevations(0.0, 0.4, 0.8, 1.2);
        ElevationProfileService service = new ElevationProfileService(repository);

        ElevationProfileService.ProfileResult result = service.profile(new LineStringGeometry(List.of(
                List.of(126.0, 0.0),
                List.of(126.0001348982, 0.0))));

        assertThat(result.ascentMeters()).isCloseTo(1.2, within(1.0e-9));
        assertThat(result.steepUphillDistanceMeters()).isCloseTo(15.0, within(1.0e-3));
    }

    @Test
    void anyMissingDemSampleMakesTheWholeProfileUnavailable() {
        DemRasterRepository repository = mock(DemRasterRepository.class);
        when(repository.findElevations(anyList())).thenAnswer(invocation -> {
            List<Coordinate> coordinates = invocation.getArgument(0);
            return List.of(
                    new ElevationSample(0, coordinates.get(0), OptionalDouble.of(10.0)),
                    new ElevationSample(1, coordinates.get(1), OptionalDouble.empty()),
                    new ElevationSample(2, coordinates.get(2), OptionalDouble.of(11.0)));
        });
        ElevationProfileService service = new ElevationProfileService(repository);

        ElevationProfileService.ProfileResult result = service.profile(new LineStringGeometry(List.of(
                List.of(126.0, 0.0),
                List.of(126.0000899322, 0.0))));

        assertThat(result.isAvailable()).isFalse();
        assertThat(result.profile()).isNull();
        assertThat(result.ascentMeters()).isNull();
        assertThat(result.steepUphillDistanceMeters()).isNull();
    }

    @Test
    void dataAccessFailureMakesTheWholeProfileUnavailable() {
        DemRasterRepository repository = mock(DemRasterRepository.class);
        when(repository.findElevations(anyList()))
                .thenThrow(new DataAccessResourceFailureException("DEM unavailable"));
        ElevationProfileService service = new ElevationProfileService(repository);

        ElevationProfileService.ProfileResult result = service.profile(new LineStringGeometry(List.of(
                List.of(126.0, 0.0),
                List.of(126.0000449661, 0.0))));

        assertThat(result.isAvailable()).isFalse();
        assertThat(result.profile()).isNull();
        assertThat(result.ascentMeters()).isNull();
        assertThat(result.steepUphillDistanceMeters()).isNull();
    }

    @Test
    void samplingCarriesResidualAcrossVerticesAndIgnoresZeroLengthEdges() {
        DemRasterRepository repository = mock(DemRasterRepository.class);
        List<List<Coordinate>> calls = new ArrayList<>();
        when(repository.findElevations(anyList())).thenAnswer(invocation -> {
            List<Coordinate> coordinates = List.copyOf(invocation.getArgument(0));
            calls.add(coordinates);
            List<ElevationSample> samples = new ArrayList<>();
            for (int index = 0; index < coordinates.size(); index++) {
                samples.add(new ElevationSample(index, coordinates.get(index), OptionalDouble.of(5.0)));
            }
            return samples;
        });
        ElevationProfileService service = new ElevationProfileService(repository);

        ElevationProfileService.ProfileResult result = service.profile(new LineStringGeometry(List.of(
                List.of(126.0, 0.0),
                List.of(126.0, 0.0),
                List.of(126.0000629525, 0.0),
                List.of(126.0000629525, 0.0000449661),
                List.of(126.0000629525, 0.0000449661))));

        assertThat(calls).hasSize(1);
        assertThat(calls.getFirst()).hasSize(4);
        assertThat(calls.getFirst().get(1).longitude()).isCloseTo(126.0000449661, within(1.0e-10));
        assertThat(calls.getFirst().get(1).latitude()).isCloseTo(0.0, within(1.0e-10));
        assertThat(calls.getFirst().get(2).longitude()).isCloseTo(126.0000629525, within(1.0e-10));
        assertThat(calls.getFirst().get(2).latitude()).isCloseTo(0.0000269797, within(1.0e-10));
        assertThat(result.profile().getLast().distanceMeters()).isCloseTo(12.0, within(1.0e-3));
    }

    @Test
    void medianSmoothingRemovesASingleSampleElevationSpike() {
        ElevationProfileService service = new ElevationProfileService(
                repositoryWithElevations(0.0, 0.0, 10.0, 0.0, 0.0));

        ElevationProfileService.ProfileResult result = service.profile(lineMeters(20.0));

        assertThat(result.profile())
                .extracting(ElevationProfileService.ProfilePoint::elevationMeters)
                .containsExactly(0.0, 0.0, 0.0, 0.0, 0.0);
        assertThat(result.ascentMeters()).isZero();
        assertThat(result.steepUphillDistanceMeters()).isZero();
    }

    @Test
    void isolatedUphillRunBelowOneMeterIsExcludedFromAscent() {
        ElevationProfileService service = new ElevationProfileService(
                repositoryWithElevations(0.0, 0.0, 0.8, 0.8, 0.0, 0.0));

        ElevationProfileService.ProfileResult result = service.profile(lineMeters(25.0));

        assertThat(result.ascentMeters()).isZero();
    }

    @Test
    void climbsBelowEightPercentAndDescentsDoNotCountAsSteepUphill() {
        ElevationProfileService gentleService = new ElevationProfileService(
                repositoryWithElevations(0.0, 0.39, 0.78, 1.17));
        ElevationProfileService descendingService = new ElevationProfileService(
                repositoryWithElevations(2.0, 1.6, 1.2, 0.8));

        ElevationProfileService.ProfileResult gentle = gentleService.profile(lineMeters(15.0));
        ElevationProfileService.ProfileResult descending = descendingService.profile(lineMeters(15.0));

        assertThat(gentle.ascentMeters()).isCloseTo(1.17, within(1.0e-9));
        assertThat(gentle.steepUphillDistanceMeters()).isZero();
        assertThat(descending.ascentMeters()).isZero();
        assertThat(descending.steepUphillDistanceMeters()).isZero();
    }

    private static LineStringGeometry lineMeters(double meters) {
        return new LineStringGeometry(List.of(
                List.of(126.0, 0.0),
                List.of(126.0 + (meters * 0.000008993216), 0.0)));
    }

    private static DemRasterRepository repositoryWithElevations(double... elevations) {
        DemRasterRepository repository = mock(DemRasterRepository.class);
        when(repository.findElevations(anyList())).thenAnswer(invocation -> {
            List<Coordinate> coordinates = invocation.getArgument(0);
            List<ElevationSample> samples = new ArrayList<>();
            for (int index = 0; index < coordinates.size(); index++) {
                samples.add(new ElevationSample(
                        index, coordinates.get(index), OptionalDouble.of(elevations[index])));
            }
            return List.copyOf(samples);
        });
        return repository;
    }
}
